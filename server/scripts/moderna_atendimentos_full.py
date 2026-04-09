import requests
import json
import time
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta

API_URL = 'https://boonsaudeapi.modernanet.com.br/api/Moderna/Busca?consulta=EXPDADOS_ID15_ATDII'
HEADERS = {
    'user': 'APIBI',
    'psw': 'B1@Mod3n@',
    'Content-Type': 'application/json'
}

DB_CONFIG = dict(
    host="boon-rds-prod.c2j6koy8871l.us-east-1.rds.amazonaws.com",
    port=5432,
    dbname="boondb",
    user="boonadmin",
    password="{EJ>p&=3]1J5O=i2l*k2s]Ag%_5Ln+Fr",
)

START_DATE = datetime(2025, 1, 1)

SQL_UPSERT = """
INSERT INTO moderna.atendimentos (
    smpesfis_id, unidade, local, smpesfis_nome, datanasc, idade, cpf,
    estipulante_razao, subestipulante, data_atendimento, especialidade,
    data_baixa, motivo_baixa, pront, convenio, plano, evento,
    medico_ficha, usuario, atendimento, medico_atendimento,
    assunto, risco, smprpac_id, dataparam
) VALUES %s
ON CONFLICT (pront, atendimento) DO UPDATE SET
    smpesfis_id = EXCLUDED.smpesfis_id,
    unidade = EXCLUDED.unidade,
    local = EXCLUDED.local,
    smpesfis_nome = EXCLUDED.smpesfis_nome,
    datanasc = EXCLUDED.datanasc,
    idade = EXCLUDED.idade,
    cpf = EXCLUDED.cpf,
    estipulante_razao = EXCLUDED.estipulante_razao,
    subestipulante = EXCLUDED.subestipulante,
    data_atendimento = EXCLUDED.data_atendimento,
    especialidade = EXCLUDED.especialidade,
    data_baixa = EXCLUDED.data_baixa,
    motivo_baixa = EXCLUDED.motivo_baixa,
    convenio = EXCLUDED.convenio,
    plano = EXCLUDED.plano,
    evento = EXCLUDED.evento,
    medico_ficha = EXCLUDED.medico_ficha,
    usuario = EXCLUDED.usuario,
    medico_atendimento = EXCLUDED.medico_atendimento,
    assunto = EXCLUDED.assunto,
    risco = EXCLUDED.risco,
    smprpac_id = EXCLUDED.smprpac_id,
    dataparam = EXCLUDED.dataparam;
"""


def fetch_day(date_str):
    for attempt in range(3):
        try:
            resp = requests.post(API_URL, headers=HEADERS, json={"DATAPARAM": date_str}, timeout=60)
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else []
            else:
                print(f"  HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"  Erro: {e}")
        time.sleep(3 * (attempt + 1))
    print(f"  Falha apos 3 tentativas para {date_str}")
    return []


def row_to_tuple(r):
    return (
        r.get('smpesfis_id'),
        r.get('UNIDADE'),
        r.get('LOCAL'),
        r.get('SMPESFIS_NOME'),
        r.get('DATANASC'),
        r.get('IDADE'),
        r.get('CPF'),
        r.get('EstipulanteRazao'),
        r.get('SubEstipulante'),
        r.get('DATA_ATENDIMENTO'),
        r.get('ESPECIALIDADE'),
        r.get('DATA_BAIXA'),
        r.get('MOTIVOBAIXA'),
        r.get('PRONT'),
        r.get('CONVÊNIO'),
        r.get('PLANO'),
        r.get('EVENTO'),
        r.get('MEDICO_FICHA'),
        r.get('USUARIO'),
        r.get('ATENDIMENTO'),
        r.get('MEDICO ATENDIMENTO'),
        r.get('Assunto'),
        r.get('RISCO'),
        r.get('SMPRPAC_ID'),
        r.get('DATAPARAM'),
    )


def run():
    today = datetime.now()
    total_days = (today - START_DATE).days + 1
    print(f"Carga total Moderna Atendimentos desde {START_DATE.strftime('%d/%m/%Y')} ({total_days} dias)\n")

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True

    # Limpar tabela antes de recarregar
    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE moderna.atendimentos")
    print("Tabela moderna.atendimentos limpa.\n")

    total = 0
    day = START_DATE

    while day <= today:
        date_str = day.strftime('%Y%m%d')
        day_num = (day - START_DATE).days + 1
        print(f"[{day_num}/{total_days}] {day.strftime('%d/%m/%Y')}...", end=" ", flush=True)

        records = fetch_day(date_str)

        if not records:
            print("0 registros")
            day += timedelta(days=1)
            continue

        rows = [row_to_tuple(r) for r in records]

        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, SQL_UPSERT, rows, page_size=500)

        total += len(rows)
        print(f"{len(rows)} registros (Total: {total})")

        day += timedelta(days=1)
        time.sleep(0.5)

    conn.close()
    print(f"\nCarga total finalizada! {total} registros processados em {total_days} dias.")


if __name__ == '__main__':
    run()
