import requests
import json
import time
import sys
from datetime import datetime

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

MAX_RETRIES = 5
BACKOFF_DELAY = 15

session = requests.Session()
session.headers.update(HEADERS)

_json_cols = None


def upsert_to_postgres(data, engine, columns):
    """UPSERT: insere novos registros ou atualiza existentes pela idBeneficiario."""
    global _json_cols
    import pandas as pd
    from sqlalchemy import text

    if not data:
        return 0

    df = pd.DataFrame(data)

    # Detecta colunas JSON apenas na primeira página
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

    # Monta o UPSERT dinâmico
    cols = [c for c in df.columns if c in columns]
    df = df[cols]

    placeholders = ", ".join([f":{c}" for c in cols])
    col_names = ", ".join([f'"{c}"' for c in cols])
    update_set = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in cols if c != "idBeneficiario"])

    upsert_sql = f"""
        INSERT INTO qbem.beneficiarios ({col_names})
        VALUES ({placeholders})
        ON CONFLICT ("idBeneficiario") DO UPDATE SET {update_set}
    """

    records = df.to_dict(orient='records')
    with engine.connect() as con:
        con.execute(text(upsert_sql), records)
        con.commit()

    return len(records)


def fetch_page(page, page_size, data_alteracao_de):
    """Busca uma página da API com filtro de data e retry exponencial."""
    data = {
        'NumPagina': str(page),
        'QtdPagina': str(page_size),
        'DataAlteracaoDe': data_alteracao_de
    }

    for attempt in range(MAX_RETRIES):
        try:
            response = session.post(API_URL, data=data, timeout=60)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            is_429 = hasattr(e, 'response') and e.response is not None and e.response.status_code == 429
            sleep_time = BACKOFF_DELAY * (2 ** attempt) if is_429 else 5 * (2 ** attempt)
            tag = "429 Rate Limit" if is_429 else str(e)
            print(f"  [!] Pagina {page}: {tag}. Aguardando {sleep_time}s... ({attempt+1}/{MAX_RETRIES})")
            time.sleep(sleep_time)

    raise Exception(f"Falha ao buscar página {page} após {MAX_RETRIES} tentativas")


def run_upsert(data_alteracao_de):
    from sqlalchemy import create_engine, text

    engine = create_engine(
        f'postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}',
        pool_pre_ping=True
    )

    # Garante que existe constraint única para o UPSERT funcionar
    with engine.connect() as con:
        con.execute(text("CREATE SCHEMA IF NOT EXISTS qbem;"))
        con.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'beneficiarios_idbeneficiario_uk'
                ) THEN
                    ALTER TABLE qbem.beneficiarios
                    ADD CONSTRAINT beneficiarios_idbeneficiario_uk UNIQUE ("idBeneficiario");
                END IF;
            END $$;
        """))
        con.commit()

    # Busca colunas da tabela para filtrar apenas as que existem
    with engine.connect() as con:
        result = con.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='qbem' AND table_name='beneficiarios'"
        ))
        db_columns = {row[0] for row in result}

    page = 1
    page_size = 100
    total_upserted = 0
    start_time = time.time()

    print(f"Buscando beneficiários alterados desde {data_alteracao_de}...\n")

    while True:
        print(f"Buscando página {page}...", end=" ", flush=True)
        json_data = fetch_page(page, page_size, data_alteracao_de)
        linhas = json_data.get('Linhas', [])

        if not linhas:
            print("(vazia — fim)")
            break

        count = upsert_to_postgres(linhas, engine, db_columns)
        total_upserted += count

        elapsed = time.time() - start_time
        rate = total_upserted / elapsed if elapsed > 0 else 0
        print(f"OK ({count} upserts) | Total: {total_upserted} | {rate:.0f} reg/s")

        if len(linhas) < page_size:
            break

        page += 1
        time.sleep(3)

    session.close()
    elapsed = time.time() - start_time
    print(f"\nTempo total: {elapsed:.1f}s | {total_upserted} registros atualizados/inseridos")
    return total_upserted


if __name__ == '__main__':
    from datetime import timedelta

    # Sempre busca os últimos 2 dias
    data_param = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')

    try:
        print(f"=== UPSERT Beneficiários alterados desde {data_param} ===\n")
        total = run_upsert(data_param)
        print(f"\nFinalizado! {total} registros processados.")
    except Exception as e:
        print(f"\nErro: {e}")
