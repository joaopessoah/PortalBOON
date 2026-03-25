import requests
import json
import time
from concurrent.futures import ThreadPoolExecutor, Future

API_URL = 'https://eb.qbem.net.br/BeneficiarioAPI/Beneficiarios'
HEADERS = {
    'email': 'joao.pessoa@boonsaude.com',
    'senha': 'JoaoPessoa89*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Connection': 'close'
}

DB_HOST = "boon-rds-prod.c2j6koy8871l.us-east-1.rds.amazonaws.com"
DB_PORT = 5432
DB_NAME = "boondb"
DB_USER = "boonadmin"
DB_PASS = "%7BEJ%3Ep%26%3D3%5D1J5O%3Di2l%2Ak2s%5DAg%25_5Ln%2BFr"

# ---------- OTIMIZAÇÕES ----------
# 1. Sessão HTTP persistente (reutiliza conexão TCP)
session = requests.Session()
session.headers.update(HEADERS)

# 2. Delay adaptativo: começa curto, aumenta só quando toma 429
BASE_DELAY = 1        # delay padrão entre páginas (segundos)
BACKOFF_DELAY = 15    # delay após um 429
MAX_RETRIES = 5
# ----------------------------------

_json_cols = None  # Cache de colunas JSON detectadas na primeira página

def save_page_to_postgres(data, engine):
    """Salva uma página no banco usando insert multi-row (mais rápido)."""
    global _json_cols
    import pandas as pd
    if not data:
        return 0

    df = pd.DataFrame(data)

    # Detecta colunas JSON apenas na primeira página, reutiliza nas demais
    if _json_cols is None:
        _json_cols = set()
        for col in df.columns:
            if df[col].apply(lambda x: isinstance(x, (dict, list))).any():
                _json_cols.add(col)

    for col in _json_cols:
        if col in df.columns:
            df[col] = df[col].apply(
                lambda x: json.dumps(x, ensure_ascii=False) if isinstance(x, (dict, list)) else x
            )

    df.to_sql('beneficiarios', engine, schema='qbem',
              if_exists='append', index=False, method='multi', chunksize=500)
    return len(df)

_hit_429 = False  # Flag para sinalizar rate limit ao loop principal

def fetch_page(page, page_size):
    """Busca uma página da API com retry e backoff exponencial."""
    global _hit_429
    data = {'NumPagina': str(page), 'QtdPagina': str(page_size)}

    for attempt in range(MAX_RETRIES):
        try:
            response = session.post(API_URL, data=data, timeout=60)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            is_429 = hasattr(e, 'response') and e.response is not None and e.response.status_code == 429
            sleep_time = BACKOFF_DELAY * (2 ** attempt) if is_429 else 5 * (2 ** attempt)
            tag = "429 Rate Limit" if is_429 else str(e)
            if is_429:
                _hit_429 = True
            print(f"  [!] Pagina {page}: {tag}. Aguardando {sleep_time}s... ({attempt+1}/{MAX_RETRIES})")
            time.sleep(sleep_time)

    raise Exception(f"Falha ao buscar página {page} após {MAX_RETRIES} tentativas")

def stream_beneficiarios():
    from sqlalchemy import create_engine, text

    page_size = 100
    total = 0
    page = 1

    engine = create_engine(
        f'postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}',
        pool_pre_ping=True
    )

    # Preparar banco
    with engine.connect() as con:
        con.execute(text("CREATE SCHEMA IF NOT EXISTS qbem;"))
        # Remove constraint única (se existir) para permitir INSERT simples
        con.execute(text("ALTER TABLE qbem.beneficiarios DROP CONSTRAINT IF EXISTS beneficiarios_idbeneficiario_uk;"))
        print("Limpando a tabela qbem.beneficiarios para nova carga total...")
        con.execute(text("TRUNCATE TABLE qbem.beneficiarios;"))
        con.commit()

    # 3. Pipeline: busca a próxima página ENQUANTO salva a atual
    executor = ThreadPoolExecutor(max_workers=1)
    save_future: Future | None = None
    delay = BASE_DELAY
    consecutive_ok = 0

    start_time = time.time()

    while True:
        print(f"Buscando página {page}...", end=" ", flush=True)

        try:
            json_data = fetch_page(page, page_size)
        except Exception as e:
            # Se a thread de save ainda está rodando, espera antes de estourar
            if save_future:
                save_future.result()
            raise e

        linhas = json_data.get('Linhas', [])
        if not linhas:
            print("(vazia — fim)")
            break

        # Espera o save anterior terminar antes de lançar o próximo
        if save_future:
            saved = save_future.result()
            total += saved

        # Lança o save em background
        save_future = executor.submit(save_page_to_postgres, linhas, engine)
        elapsed = time.time() - start_time
        rate = total / elapsed if elapsed > 0 else 0
        print(f"OK ({len(linhas)} rows) | Total: {total} | {rate:.0f} reg/s")

        if len(linhas) < page_size:
            break

        page += 1

        # Delay adaptativo: sobe após 429, reduz gradualmente quando estável
        global _hit_429
        if _hit_429:
            delay = BACKOFF_DELAY
            consecutive_ok = 0
            _hit_429 = False
        else:
            consecutive_ok += 1
            if consecutive_ok > 10:
                delay = max(0.5, delay * 0.8)
        time.sleep(delay)

    # Aguarda último save
    if save_future:
        saved = save_future.result()
        total += saved

    executor.shutdown(wait=True)

    # Recria constraint única para o script de UPSERT incremental funcionar
    with engine.connect() as con:
        print("Recriando constraint única em idBeneficiario...")
        con.execute(text("""
            ALTER TABLE qbem.beneficiarios
            ADD CONSTRAINT beneficiarios_idbeneficiario_uk UNIQUE ("idBeneficiario");
        """))
        con.commit()

    elapsed = time.time() - start_time
    print(f"\nTempo total: {elapsed:.1f}s | Velocidade media: {total/elapsed:.0f} reg/s")
    return total

if __name__ == '__main__':
    try:
        print("Iniciando processo de Carga Beneficiários (API -> PostgreSQL)...")
        print("Otimizações: sessão HTTP persistente, insert multi-row, pipeline fetch+save\n")
        total = stream_beneficiarios()
        print(f"\nProcesso finalizado! Total de beneficiarios salvos: {total}")

    except Exception as e:
        print(f"\nErro durante a extracao/carga: {e}")
