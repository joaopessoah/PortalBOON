# nps_full.py
# -*- coding: utf-8 -*-
# Materializa botmaker.nps a partir de mensagens NPS em botmaker.botmaker.
# Idempotente: pode rodar quantas vezes quiser. Usa UPSERT por resposta_msg_id.

from datetime import datetime
import psycopg2

DB_CONFIG = dict(
    host="boon-rds-prod.c2j6koy8871l.us-east-1.rds.amazonaws.com",
    port=5432,
    dbname="boondb",
    user="boonadmin",
    password="{EJ>p&=3]1J5O=i2l*k2s]Ag%_5Ln+Fr",
)


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


DDL = """
CREATE SCHEMA IF NOT EXISTS botmaker;

CREATE TABLE IF NOT EXISTS botmaker.nps (
    id BIGSERIAL PRIMARY KEY,
    pergunta_msg_id TEXT NOT NULL,
    resposta_msg_id TEXT NOT NULL UNIQUE,
    chat_chatid TEXT,
    session_id TEXT,
    cpf TEXT,
    cpf_formatted TEXT,
    nota SMALLINT NOT NULL CHECK (nota BETWEEN 0 AND 10),
    categoria TEXT GENERATED ALWAYS AS (
        CASE WHEN nota >= 9 THEN 'promotor'
             WHEN nota >= 7 THEN 'neutro'
             ELSE 'detrator' END
    ) STORED,
    estipulante_razao TEXT,
    pergunta_time TIMESTAMPTZ,
    resposta_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_nps_resposta_time ON botmaker.nps (resposta_time);
CREATE INDEX IF NOT EXISTS ix_nps_cpf            ON botmaker.nps (cpf);
CREATE INDEX IF NOT EXISTS ix_nps_estipulante    ON botmaker.nps (estipulante_razao);
CREATE INDEX IF NOT EXISTS ix_nps_categoria      ON botmaker.nps (categoria);
"""


UPSERT_SQL = r"""
INSERT INTO botmaker.nps (
    pergunta_msg_id, resposta_msg_id, chat_chatid, session_id,
    cpf, cpf_formatted, nota, estipulante_razao,
    pergunta_time, resposta_time
)
WITH perguntas AS (
    SELECT id AS pergunta_id, chat_chatid, creation_time, session_id,
           -- janela = até a próxima pergunta NPS no mesmo chat (ou +1 ano se for a última)
           COALESCE(
               LEAD(creation_time) OVER (PARTITION BY chat_chatid ORDER BY creation_time),
               creation_time + INTERVAL '365 days'
           ) AS proxima_p_time
    FROM botmaker.botmaker
    WHERE content_text ILIKE '%modelo NPS%'
      AND from_role IN ('bot','agent')
),
respostas_brutas AS (
    SELECT p.pergunta_id, p.chat_chatid, p.creation_time AS p_time, p.session_id,
           b.id AS resposta_id, b.creation_time AS r_time,
           COALESCE(NULLIF(b.selected_button,''), TRIM(b.content_text)) AS nota_str
    FROM perguntas p
    JOIN botmaker.botmaker b
      ON b.chat_chatid = p.chat_chatid
     AND b.from_role = 'user'
     AND b.creation_time > p.creation_time
     AND b.creation_time < p.proxima_p_time
),
respostas AS (
    -- DISTINCT ON (resposta_id) é defensivo: garante que cada msg do user é
    -- contada uma única vez (associada à pergunta mais recente) caso haja
    -- alguma sobreposição.
    SELECT DISTINCT ON (resposta_id)
           pergunta_id, chat_chatid, p_time, session_id, resposta_id, r_time, nota_str
    FROM respostas_brutas
    WHERE nota_str ~ '^([0-9]|10)$'
    ORDER BY resposta_id, p_time DESC
),
moderna_unique AS (
    -- Fonte primária: estipulante via último atendimento moderna do CPF.
    -- Mantém os nomes consistentes com o filtro do dashboard SLA.
    SELECT DISTINCT ON (REGEXP_REPLACE(COALESCE(cpf,''),'\D','','g'))
           REGEXP_REPLACE(COALESCE(cpf,''),'\D','','g') AS cpf_clean,
           estipulante_razao
    FROM moderna.atendimentos
    WHERE cpf IS NOT NULL AND estipulante_razao IS NOT NULL
    ORDER BY REGEXP_REPLACE(COALESCE(cpf,''),'\D','','g'),
             data_atendimento DESC NULLS LAST
),
benef_unique AS (
    -- Fallback: para cada CPF, pega o registro com maior idBeneficiario (resolve
    -- duplicidade quando o mesmo CPF está em mais de uma empresa).
    SELECT DISTINCT ON (REGEXP_REPLACE(COALESCE("CPF",''),'\D','','g'))
           REGEXP_REPLACE(COALESCE("CPF",''),'\D','','g') AS cpf_clean,
           "NomeEstipulante" AS estipulante
    FROM qbem.beneficiarios
    WHERE "CPF" IS NOT NULL AND "NomeEstipulante" IS NOT NULL
    ORDER BY REGEXP_REPLACE(COALESCE("CPF",''),'\D','','g'),
             "idBeneficiario" DESC NULLS LAST
)
SELECT
    r.pergunta_id,
    r.resposta_id,
    r.chat_chatid,
    r.session_id,
    REGEXP_REPLACE(COALESCE(c.cpf,''), '\D', '', 'g') AS cpf,
    c.cpf_formatted,
    r.nota_str::int AS nota,
    COALESCE(mu.estipulante_razao, bu.estipulante) AS estipulante_razao,
    r.p_time,
    r.r_time
FROM respostas r
LEFT JOIN botmaker.cpf c ON c.chat_chatid = r.chat_chatid
LEFT JOIN moderna_unique mu
       ON mu.cpf_clean = REGEXP_REPLACE(COALESCE(c.cpf,''), '\D', '', 'g')
      AND c.cpf IS NOT NULL AND c.cpf <> ''
LEFT JOIN benef_unique bu
       ON bu.cpf_clean = REGEXP_REPLACE(COALESCE(c.cpf,''), '\D', '', 'g')
      AND c.cpf IS NOT NULL AND c.cpf <> ''
ON CONFLICT (resposta_msg_id) DO UPDATE
SET estipulante_razao = EXCLUDED.estipulante_razao,
    cpf               = EXCLUDED.cpf,
    cpf_formatted     = EXCLUDED.cpf_formatted;
"""


SUMMARY_SQL = """
SELECT
    COUNT(*)::int                                                   AS total,
    COUNT(*) FILTER (WHERE categoria='promotor')::int               AS promotores,
    COUNT(*) FILTER (WHERE categoria='neutro')::int                 AS neutros,
    COUNT(*) FILTER (WHERE categoria='detrator')::int               AS detratores,
    COUNT(*) FILTER (WHERE estipulante_razao IS NOT NULL)::int      AS com_estipulante,
    ROUND(
        (COUNT(*) FILTER (WHERE categoria='promotor')::numeric
       - COUNT(*) FILTER (WHERE categoria='detrator')::numeric)
       / NULLIF(COUNT(*),0) * 100, 1
    ) AS nps_score,
    MAX(resposta_time) AS ultima_resposta
FROM botmaker.nps;
"""


def main():
    log("Conectando ao banco...")
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SET application_name = 'nps_full';")

            log("Aplicando DDL (idempotente)...")
            cur.execute(DDL)

            log("Executando UPSERT (pergunta -> resposta -> CPF -> estipulante)...")
            t0 = datetime.now()
            cur.execute(UPSERT_SQL)
            inseridas = cur.rowcount
            elapsed = (datetime.now() - t0).total_seconds()
            log(f"Linhas novas inseridas: {inseridas} | tempo: {elapsed:.1f}s")

            log("Sumário atual da tabela botmaker.nps:")
            cur.execute(SUMMARY_SQL)
            row = cur.fetchone()
            cols = [d.name for d in cur.description]
            for k, v in zip(cols, row):
                log(f"  {k:18s} = {v}")
    finally:
        conn.close()
    log("Concluído.")


if __name__ == "__main__":
    main()
