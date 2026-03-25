# pipeline_completo_botmaker.py
# -*- coding: utf-8 -*-

import calendar
import json
import time
import re
import unicodedata
import urllib.parse as urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Iterator, List, Optional, Tuple

import requests
import psycopg2
import psycopg2.extras

# ==============================================================================
#                           CONFIGURAÇÕES GERAIS
# ==============================================================================

# Configuração do Banco de Dados
DB_CONFIG = dict(
    host="boon-rds-prod.c2j6koy8871l.us-east-1.rds.amazonaws.com",
    port=5432,
    dbname="boondb",
    user="boonadmin",
    password="{EJ>p&=3]1J5O=i2l*k2s]Ag%_5Ln+Fr",
)

# Configuração da API Botmaker
API_URL = "https://api.botmaker.com/v2.0/messages"
ACCESS_TOKEN = (
    "eyJhbGciOiJIUzUxMiJ9.eyJidXNpbmVzc0lkIjoiYW1hcnFjb25zdWx0b3JpYSIsIm5hbWUiOiJKb8OjbyBQZXNzb2EiLCJhcGkiOnRydWUsImlkIjoibmtTaUhMeXQzbmNjbzdiZnBROFJCOXJ0NzU5MyIsImV4cCI6MTkwNDgyNTAzMCwianRpIjoibmtTaUhMeXQzbmNjbzdiZnBROFJCOXJ0NzU5MyJ9.YXllUQaoIaPRTUA3rPFdEEosxFwfHh75eRWkmrMomrzBtToHWipTOBua4qMuU4iEFuDBe4c2AdsGphIlAnDgsA"
)

# Datas de Corte (Global)
# Define a data inicial para ingestão, busca de CPF e relatório de ativações
GLOBAL_START_DATE = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
GLOBAL_END_DATE = datetime.now(timezone.utc)

# Configurações de Performance
MAX_WORKERS = 4          # Threads paralelas para download da API
API_PAGE_LIMIT = 1500    # Limite por página na API
BATCH_SIZE = 10000       # Tamanho do lote para INSERTs no banco
USE_UNLOGGED = True      # Usa tabelas UNLOGGED durante carga (mais rápido, sem WAL)

# ==============================================================================
#                           UTILITÁRIOS COMPARTILHADOS
# ==============================================================================

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")

def get_db_connection(autocommit=True, app_name="botmaker_pipeline"):
    conn = psycopg2.connect(**DB_CONFIG)
    if autocommit:
        conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f"SET application_name = '{app_name}';")
        if autocommit:
            cur.execute("SET synchronous_commit = OFF;") 
    return conn

def set_table_logged_status(schema_table: str, unlogged: bool):
    """Alterna entre LOGGED e UNLOGGED para performance."""
    conn = get_db_connection()
    try:
        state = "UNLOGGED" if unlogged else "LOGGED"
        with conn.cursor() as cur:
            cur.execute(f"ALTER TABLE IF EXISTS {schema_table} SET {state};")
        log(f"Tabela {schema_table} alterada para {state}.")
    except Exception as e:
        log(f"Aviso ao alterar status da tabela {schema_table}: {e}")
    finally:
        conn.close()

def ensure_schema():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("CREATE SCHEMA IF NOT EXISTS botmaker;")
    finally:
        conn.close()

# ==============================================================================
#               MÓDULO 1: INGESTÃO DE DADOS (ANTIGO botmaker.py)
# ==============================================================================

SQL_CREATE_RAW = """
CREATE TABLE IF NOT EXISTS botmaker.botmaker (
    id TEXT PRIMARY KEY,
    creation_time TIMESTAMPTZ,
    from_role TEXT,
    content_type TEXT,
    content_text TEXT,
    selected_button TEXT,
    session_creation_time TIMESTAMPTZ,
    chat_chatid TEXT,
    chat_channelid TEXT,
    chat_contactid TEXT,
    session_id TEXT,
    raw JSONB
);
CREATE INDEX IF NOT EXISTS ix_botmaker_creation_time ON botmaker.botmaker (creation_time);
"""

SQL_UPSERT_RAW = """
INSERT INTO botmaker.botmaker (
    id, creation_time, from_role, content_type, content_text, selected_button,
    session_creation_time, chat_chatid, chat_channelid, chat_contactid, session_id, raw
) VALUES %s
ON CONFLICT (id) DO UPDATE SET
    creation_time = EXCLUDED.creation_time,
    from_role = EXCLUDED.from_role,
    content_type = EXCLUDED.content_type,
    content_text = EXCLUDED.content_text,
    selected_button = EXCLUDED.selected_button,
    session_creation_time = EXCLUDED.session_creation_time,
    chat_chatid = EXCLUDED.chat_chatid,
    chat_channelid = EXCLUDED.chat_channelid,
    chat_contactid = EXCLUDED.chat_contactid,
    session_id = EXCLUDED.session_id,
    raw = EXCLUDED.raw;
"""

def iso_ms(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def floor_to_hour(dt: datetime) -> datetime:
    return dt.replace(minute=0, second=0, microsecond=0)

def parse_dt_or_none(s: Optional[str]) -> Optional[datetime]:
    if not s: return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
        try: return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except: continue
    return None

def safe_get(d: Dict[str, Any], path: List[str], default=None):
    cur = d
    for p in path:
        if not isinstance(cur, dict) or p not in cur: return default
        cur = cur[p]
    return cur

def add_months(dt: datetime, months: int) -> datetime:
    year = dt.year + (dt.month - 1 + months) // 12
    month = (dt.month - 1 + months) % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(dt.day, last_day)
    return dt.replace(year=year, month=month, day=day)

def month_windows(date_from: datetime, date_to: datetime) -> List[Tuple[datetime, datetime]]:
    date_to_safe = floor_to_hour(date_to)
    wins = []
    cur_start = date_from
    while cur_start < date_to_safe:
        cur_end = min(add_months(cur_start, 1), date_to_safe)
        if cur_end <= cur_start: break
        wins.append((cur_start, cur_end))
        cur_start = cur_end
    return wins

def request_messages(session: requests.Session, url: str, headers: Dict[str, str]) -> Dict[str, Any]:
    for attempt in range(1, 6): # Retry Max 5
        try:
            resp = session.get(url, headers=headers, timeout=60)
            if resp.status_code == 200: return resp.json()
            if resp.status_code == 204: return {"items": []} 
            if resp.status_code in (400, 401, 403, 404): raise RuntimeError(f"HTTP {resp.status_code}: {resp.text}")
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            if attempt == 5: raise
            time.sleep(1.5 ** (attempt - 1))

def paginate_window(session: requests.Session, date_from: datetime, date_to: datetime) -> Iterator[Dict[str, Any]]:
    headers = {"Accept": "application/json", "access-token": ACCESS_TOKEN}
    params = {
        "limit": str(API_PAGE_LIMIT),
        "long-term-search": "true",
        "from": iso_ms(date_from),
        "to": iso_ms(date_to),
    }
    url = API_URL + "?" + urlparse.urlencode(params)
    while True:
        data = request_messages(session, url, headers)
        for it in data.get("items", []): yield it
        next_page = data.get("nextPage")
        if not next_page: break
        url = next_page

def flatten_item(it: Dict[str, Any]) -> Dict[str, Any]:
    c_type = safe_get(it, ["content", "type"])
    return {
        "id": it.get("id"),
        "creation_time": parse_dt_or_none(it.get("creationTime")),
        "from_role": it.get("from"),
        "content_type": c_type,
        "content_text": safe_get(it, ["content", "text"]) if c_type != "button-click" else None,
        "selected_button": safe_get(it, ["content", "selectedButton"]) if c_type == "button-click" else None,
        "session_creation_time": parse_dt_or_none(it.get("sessionCreationTime")),
        "chat_chatid": safe_get(it, ["chat", "chatId"]),
        "chat_channelid": safe_get(it, ["chat", "channelId"]),
        "chat_contactid": safe_get(it, ["chat", "contactId"]),
        "session_id": it.get("sessionId"),
        "raw": json.dumps(it, ensure_ascii=False),
    }

def process_ingestion_window(win: Tuple[datetime, datetime]) -> Tuple[str, int, int]:
    w_from, w_to = win
    session = requests.Session()
    conn = get_db_connection(app_name="botmaker_loader_worker")
    
    items_count = 0
    inserted = 0
    batch_rows = []
    seen_ids = set()

    try:
        for it in paginate_window(session, w_from, w_to):
            _id = it.get("id")
            if not _id or _id in seen_ids: continue
            seen_ids.add(_id)

            batch_rows.append(flatten_item(it))
            items_count += 1

            if len(batch_rows) >= BATCH_SIZE:
                with conn.cursor() as cur:
                    psycopg2.extras.execute_values(cur, SQL_UPSERT_RAW, [tuple(r.values()) for r in batch_rows], page_size=BATCH_SIZE)
                inserted += len(batch_rows)
                batch_rows.clear()

        if batch_rows:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(cur, SQL_UPSERT_RAW, [tuple(r.values()) for r in batch_rows], page_size=BATCH_SIZE)
            inserted += len(batch_rows)
        
        return (f"{iso_ms(w_from)}", items_count, inserted)
    finally:
        conn.close()
        session.close()

def run_ingestion_pipeline():
    log("=== INÍCIO: INGESTÃO BOTMAKER API ===")
    
    # Setup Tabela
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute(SQL_CREATE_RAW)
    conn.close()
    
    if USE_UNLOGGED:
        set_table_logged_status("botmaker.botmaker", True)

    wins = month_windows(GLOBAL_START_DATE, GLOBAL_END_DATE)
    total_upserts = 0
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(process_ingestion_window, w): w for w in wins}
        for i, fut in enumerate(as_completed(futures)):
            try:
                desc, items, ins = fut.result()
                total_upserts += ins
                log(f"[{i+1}/{len(wins)}] Janela {desc}: {items} baixados | {ins} inseridos.")
            except Exception as e:
                log(f"ERRO Janela {futures[fut]}: {e}")

    if USE_UNLOGGED:
        set_table_logged_status("botmaker.botmaker", False)
        
    log(f"=== FIM: INGESTÃO BOTMAKER API (Total Upserts: {total_upserts}) ===\n")

# ==============================================================================
#               MÓDULO 2: EXTRAÇÃO DE CPF (ANTIGO cpf_botmaker.py)
# ==============================================================================

CPF_REGEX = re.compile(r"\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b")
CPF_KEYWORDS = ["seu cpf", "informar o cpf", "informe o cpf", "pode nos informar o seu cpf", "qual seu cpf", "qual é o seu cpf"]

SQL_CREATE_CPF = """
CREATE TABLE IF NOT EXISTS botmaker.cpf (
    chat_chatid TEXT PRIMARY KEY,
    cpf TEXT,
    cpf_formatted TEXT,
    first_seen_at TIMESTAMPTZ,
    source_message_id TEXT,
    question_message_id TEXT,
    last_updated_at TIMESTAMPTZ DEFAULT now()
);
"""

SQL_SELECT_RAW_STREAM = """
SELECT id, creation_time, from_role, content_type, content_text, chat_chatid
FROM botmaker.botmaker
WHERE (%(since)s IS NULL OR creation_time >= %(since)s)
ORDER BY chat_chatid, creation_time;
"""

# Alterado para ON CONFLICT DO NOTHING para garantir que o primeiro CPF nunca seja sobrescrito
SQL_UPSERT_CPF = """
INSERT INTO botmaker.cpf
    (chat_chatid, cpf, cpf_formatted, first_seen_at, source_message_id, question_message_id)
VALUES %s
ON CONFLICT (chat_chatid) DO NOTHING;
"""

def normalize_text(txt: str) -> str:
    if not txt: return ""
    txt = unicodedata.normalize("NFKD", txt)
    txt = "".join([c for c in txt if not unicodedata.combining(c)])
    return txt.lower()

def only_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")

def cpf_is_valid(cpf_digits: str) -> bool:
    cpf = only_digits(cpf_digits)
    if len(cpf) != 11 or cpf == cpf[0] * 11: return False
    soma = sum(int(cpf[i]) * (10 - i) for i in range(9))
    d1 = (soma * 10) % 11
    d1 = 0 if d1 == 10 else d1
    if d1 != int(cpf[9]): return False
    soma = sum(int(cpf[i]) * (11 - i) for i in range(10))
    d2 = (soma * 10) % 11
    d2 = 0 if d2 == 10 else d2
    return d2 == int(cpf[10])

def cpf_format(cpf_digits: str) -> str:
    d = only_digits(cpf_digits)
    if len(d) != 11: return d
    return f"{d[0:3]}.{d[3:6]}.{d[6:9]}-{d[9:11]}"

def run_cpf_extraction_pipeline():
    log("=== INÍCIO: EXTRAÇÃO DE CPF ===")
    
    conn_admin = get_db_connection()
    with conn_admin.cursor() as cur:
        cur.execute(SQL_CREATE_CPF)
    conn_admin.close()

    if USE_UNLOGGED:
        set_table_logged_status("botmaker.cpf", True)

    conn_read = get_db_connection(autocommit=False, app_name="cpf_reader")
    conn_write = get_db_connection(app_name="cpf_writer")
    
    try:
        cur_read = conn_read.cursor(name="cpf_stream_cursor", cursor_factory=psycopg2.extras.DictCursor)
        cur_read.itersize = 50000
        cur_read.execute(SQL_SELECT_RAW_STREAM, {"since": GLOBAL_START_DATE})

        pending_question = {} # chat -> {id, time}
        batch = {}
        total_found = 0
        total_upserts = 0
        
        while True:
            rows = cur_read.fetchmany(50000)
            if not rows: break

            for r in rows:
                chat = r["chat_chatid"]
                dt = r["creation_time"]
                role = r["from_role"]
                text = (r["content_text"] or "").strip()
                
                if chat in pending_question and dt - pending_question[chat]["time"] > timedelta(minutes=30):
                    pending_question.pop(chat, None)

                if role == "bot":
                    t_norm = normalize_text(text)
                    if "cpf" in t_norm and any(k in t_norm for k in CPF_KEYWORDS):
                        pending_question[chat] = {"id": r["id"], "time": dt}
                
                elif role == "user" and r["content_type"] == "text" and chat in pending_question:
                    for m in CPF_REGEX.findall(text):
                        cand = only_digits(m)
                        if cpf_is_valid(cand):
                            total_found += 1
                            # Só adiciona no batch se ainda não achamos o primeiro CPF nesta rodada
                            if chat not in batch:
                                batch[chat] = (chat, cand, cpf_format(cand), dt, r["id"], pending_question[chat]["id"])
                            
                            pending_question.pop(chat, None)
                            break
            
            if len(batch) >= 2000:
                with conn_write.cursor() as cur:
                    psycopg2.extras.execute_values(cur, SQL_UPSERT_CPF, list(batch.values()))
                total_upserts += len(batch)
                batch = {}

        if batch:
            with conn_write.cursor() as cur:
                psycopg2.extras.execute_values(cur, SQL_UPSERT_CPF, list(batch.values()))
            total_upserts += len(batch)

        cur_read.close()
        conn_read.rollback()

    finally:
        conn_read.close()
        conn_write.close()

    if USE_UNLOGGED:
        set_table_logged_status("botmaker.cpf", False)

    log(f"=== FIM: EXTRAÇÃO DE CPF (CPFs encontrados: {total_found}, Tentativas de Insert: {total_upserts}) ===\n")

# ==============================================================================
#               MÓDULO 3: RELATÓRIO DE ATIVAÇÕES (ANTIGO ativacoes.py)
# ==============================================================================

SQL_CREATE_ATIVACOES = """
CREATE TABLE IF NOT EXISTS botmaker.ativacoes (
    id TEXT PRIMARY KEY,
    creation_time TIMESTAMPTZ,
    content_text TEXT,
    session_creation_time TIMESTAMPTZ,
    chat_chatid TEXT,
    chat_contactid TEXT,
    cpf TEXT,
    cpf_formatted TEXT,
    last_update_at TIMESTAMPTZ,
    last_refreshed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ativacoes_creation_time ON botmaker.ativacoes (creation_time);
CREATE INDEX IF NOT EXISTS ix_ativacoes_cpf_time ON botmaker.ativacoes (cpf, creation_time DESC);
"""

SQL_SELECT_ATIVACOES = """
SELECT
    b.id, b.creation_time, b.content_text, b.session_creation_time,
    b.chat_chatid, b.chat_contactid,
    c.cpf, c.cpf_formatted, c.last_updated_at
FROM botmaker.botmaker b
LEFT JOIN botmaker.cpf c ON c.chat_chatid = b.chat_chatid
WHERE b.from_role = 'bot'
  AND b.creation_time >= %(cutoff)s
  AND b.content_text LIKE '%%seu benefício está ativado!%%'
  AND b.content_type IN ('text','buttons')
  AND (b.chat_contactid IS NULL OR b.chat_contactid NOT LIKE 'amarqconsultoria_test_chat%%');
"""

SQL_UPSERT_ATIVACOES = """
INSERT INTO botmaker.ativacoes (
    id, creation_time, content_text, session_creation_time, chat_chatid, chat_contactid,
    cpf, cpf_formatted, last_update_at, last_refreshed_at
) VALUES %s
ON CONFLICT (id) DO UPDATE SET
    creation_time = EXCLUDED.creation_time,
    content_text = EXCLUDED.content_text,
    session_creation_time = EXCLUDED.session_creation_time,
    chat_chatid = EXCLUDED.chat_chatid,
    chat_contactid = EXCLUDED.chat_contactid,
    cpf = EXCLUDED.cpf,
    cpf_formatted = EXCLUDED.cpf_formatted,
    last_update_at = EXCLUDED.last_update_at,
    last_refreshed_at = now();
"""

SQL_DEDUP_ATIVACOES = """
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY cpf ORDER BY creation_time DESC, id DESC) AS rn
    FROM botmaker.ativacoes WHERE cpf IS NOT NULL
)
DELETE FROM botmaker.ativacoes a USING ranked r WHERE a.id = r.id AND r.rn > 1;
"""

def run_ativacoes_pipeline():
    log("=== INÍCIO: GERAR TABELA ATIVAÇÕES ===")
    
    conn = get_db_connection(app_name="ativacoes_builder")
    try:
        with conn.cursor() as cur:
            cur.execute(SQL_CREATE_ATIVACOES)
        
        # Busca
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(SQL_SELECT_ATIVACOES, {"cutoff": GLOBAL_START_DATE})
            rows = cur.fetchall()
            
        if not rows:
            log("Nenhuma ativação encontrada.")
            return

        # Prepara Payload para Upsert
        payload = [
            (r["id"], r["creation_time"], r["content_text"], r["session_creation_time"],
             r["chat_chatid"], r["chat_contactid"], r["cpf"], r["cpf_formatted"], r["last_updated_at"], datetime.now())
            for r in rows
        ]

        # Executa Upsert
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, SQL_UPSERT_ATIVACOES, payload, page_size=1000)
        
        # Executa Deduplicação
        with conn.cursor() as cur:
            cur.execute(SQL_DEDUP_ATIVACOES)
            dedup_count = cur.rowcount
            
        log(f"Upsert concluído: {len(payload)} registros. Duplicados removidos: {dedup_count}.")

    finally:
        conn.close()
    
    log("=== FIM: GERAR TABELA ATIVAÇÕES ===\n")

# ==============================================================================
#                                   MAIN
# ==============================================================================

if __name__ == "__main__":
    ensure_schema()
    
    start_total = time.time()
    
    # 1. Baixa tudo da API para botmaker.botmaker
    run_ingestion_pipeline()
    
    # 2. Processa o botmaker.botmaker para preencher botmaker.cpf
    run_cpf_extraction_pipeline()
    
    # 3. Gera a tabela final botmaker.ativacoes cruzando msg + cpf
    run_ativacoes_pipeline()
    
    elapsed = time.time() - start_total
    log(f"PIPELINE COMPLETO FINALIZADO EM {elapsed/60:.2f} MINUTOS.")