import psycopg2
from psycopg2 import Error

# Parâmetros de conexão
db_config = {
    "host": "boon-rds-prod.c2j6koy8871l.us-east-1.rds.amazonaws.com",
    "port": 5432,
    "dbname": "boondb",
    "user": "boonadmin",
    "password": "{EJ>p&=3]1J5O=i2l*k2s]Ag%_5Ln+Fr" 
}

# Query SQL: Recria a tabela com a nova coluna, formatação de data e exclusão de duplicatas exatas
sql_query = """
DROP TABLE IF EXISTS portal_boon.ativacoes;

CREATE TABLE portal_boon.ativacoes AS
SELECT DISTINCT
    b."NomeEstipulante", 
    b."CNPJEstipulante", 
    b."NomeSubestipulante", 
    b."GrauParentesco", 
    b."NomeCompleto", 
    b."NomeTitular", 
    b."CPF", 
    b."CPFTitular", 
    (b."Contatos"::jsonb -> 0 ->> 'DDD') || (b."Contatos"::jsonb -> 0 ->> 'Telefone') AS "Contato",
    CASE 
        WHEN ba.cpf IS NOT NULL THEN 'Sim' 
        ELSE 'Não' 
    END AS "AtivoBotmaker",
    TO_CHAR(ba.creation_time, 'DD-MM-YYYY HH24:MI:SS') AS "DataCriacaoBotmaker"
FROM 
    qbem.beneficiarios b
LEFT JOIN (
    -- O DISTINCT ON garante que pegaremos sempre o primeiro registro (cpf) do botmaker.
    SELECT DISTINCT ON (cpf) cpf, creation_time 
    FROM botmaker.ativacoes 
    ORDER BY cpf, creation_time ASC
) ba ON ba.cpf = b."CPF"
WHERE 
    b."StatusBeneficiario" = 'Ativo';
"""

def atualizar_tabela_ativacoes():
    conexao = None
    cursor = None
    try:
        # Estabelecendo a conexão com o banco de dados
        print("Conectando ao PostgreSQL...")
        conexao = psycopg2.connect(**db_config)
        cursor = conexao.cursor()

        # Executando o processo de recriação da tabela filtrando as duplicatas
        print("Recriando a tabela, filtrando duplicatas e subindo os dados atualizados...")
        cursor.execute(sql_query)
        
        # Confirmando a transação
        conexao.commit()
        print("Tabela portal_boon.ativacoes atualizada sem linhas duplicadas com sucesso!")

    except Error as e:
        print(f"Erro ao conectar ou executar a query no PostgreSQL: {e}")
        if conexao:
            conexao.rollback()
            
    finally:
        # Fechando a conexão
        if cursor:
            cursor.close()
        if conexao:
            conexao.close()
            print("Conexão com o PostgreSQL encerrada.")

if __name__ == "__main__":
    atualizar_tabela_ativacoes()