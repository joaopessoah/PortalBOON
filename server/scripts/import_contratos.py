import requests
import json
import time

API_URL = 'https://eb.qbem.net.br/EstipulanteApi/Contratos'
HEADERS = {
    'email': 'joao.pessoa@boonsaude.com',
    'senha': 'JoaoPessoa89*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Connection': 'close' # Evita segurar conexoes no WAF
}

DB_HOST = "boon-rds-prod.c2j6koy8871l.us-east-1.rds.amazonaws.com"
DB_PORT = 5432
DB_NAME = "boondb"
DB_USER = "boonadmin"
DB_PASS = "%7BEJ%3Ep%26%3D3%5D1J5O%3Di2l%2Ak2s%5DAg%25_5Ln%2BFr"

def save_page_to_postgres(data, engine, json_cols=None):
    import pandas as pd
    if not data:
        return set()

    df = pd.DataFrame(data)

    # Detect JSON columns on first call, reuse on subsequent calls
    if json_cols is None:
        json_cols = set()
        for col in df.columns:
            if df[col].apply(lambda x: isinstance(x, (dict, list))).any():
                json_cols.add(col)

    # Convert only known JSON columns
    for col in json_cols:
        if col in df.columns:
            df[col] = df[col].apply(lambda x: json.dumps(x, ensure_ascii=False) if isinstance(x, (dict, list)) else x)

    # Write to postgres with multi-row inserts (much faster)
    df.to_sql('contratos', engine, schema='qbem', if_exists='append', index=False, method='multi', chunksize=500)

    return json_cols

def stream_contratos():
    from sqlalchemy import create_engine, text

    page = 1
    page_size = 100  # API limits to 100 per page regardless of requested size
    total_processed = 0
    json_cols = None  # Cache detected JSON columns across pages

    # Create database engine
    engine = create_engine(f'postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}')

    # Ensure schema exists and clear table
    with engine.connect() as con:
        con.execute(text("CREATE SCHEMA IF NOT EXISTS qbem;"))
        print("Limpando a tabela qbem.contratos para nova carga total...")
        con.execute(text("TRUNCATE TABLE qbem.contratos;"))  # TRUNCATE is much faster than DELETE
        con.commit()

    # Reuse TCP connection across requests
    session = requests.Session()
    session.headers.update(HEADERS)

    while True:
        print(f"Buscando página {page} da API...")
        data = {
            'NumPagina': str(page),
            'QtdPagina': str(page_size)
        }

        # Retry mechanism with exponential backoff for rate limiting
        max_retries = 5
        for attempt in range(max_retries):
            try:
                response = session.post(API_URL, data=data, timeout=60)
                response.raise_for_status()
                break  # Success
            except requests.exceptions.RequestException as e:
                wait_time = 10 * (2 ** attempt)  # 10s, 20s, 40s, 80s, 160s
                print(f"Erro ao buscar página {page}: {e}. Aguardando {wait_time}s antes de retentar ({attempt+1}/{max_retries})...")
                time.sleep(wait_time)
        else:
            raise Exception(f"Falha ao buscar página {page} após {max_retries} tentativas")

        json_data = response.json()
        linhas = json_data.get('Linhas', [])

        if not linhas:
            break

        json_cols = save_page_to_postgres(linhas, engine, json_cols)

        total_processed += len(linhas)
        print(f"Página {page}: {len(linhas)} registros (Total: {total_processed})")

        if len(linhas) < page_size:
            break

        page += 1
        time.sleep(3)  # Intervalo maior para evitar rate limit (429)

    session.close()
    return total_processed

if __name__ == '__main__':
    try:
        print("Iniciando processo de Carga direto para PostgreSQL...")
        total = stream_contratos()
        print(f"Processo finalizado com sucesso! Total de registros salvos: {total}")
        
    except Exception as e:
        print(f"Erro durante a extração/carga: {e}")
