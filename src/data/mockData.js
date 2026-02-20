export const mockUsers = [
    {
        id: 1,
        name: 'Administrador BOON',
        email: 'admin@empresa.com',
        password: '123',
        role: 'admin',
        status: 'active',
        groups: ['Financeiro', 'RH', 'Saúde'],
        avatar: null
    },
    {
        id: 2,
        name: 'João Silva',
        email: 'user@empresa.com',
        password: '123',
        role: 'user',
        status: 'active',
        groups: ['Financeiro', 'RH'],
        avatar: null
    }
]

export const mockCategories = [
    { id: 1, name: 'Financeiro', color: '#7c3aed' },
    { id: 2, name: 'RH', color: '#2563eb' },
    { id: 3, name: 'Saúde', color: '#059669' }
]

export const mockDashboards = [
    {
        id: 1,
        name: 'Receita Mensal',
        description: 'Acompanhe a receita mensal consolidada por unidade de negócio e filial.',
        category: 'Financeiro',
        url: 'https://app.powerbi.com/view?r=example1',
        workspaceId: '',
        reportId: '',
        groupId: '',
        order: 1,
        active: true,
        visibility: 'all',
        groups: [],
        users: [],
        pinned: true,
        lastUpdate: '2026-02-17T10:30:00',
        createdAt: '2026-01-15T08:00:00'
    },
    {
        id: 2,
        name: 'Despesas Operacionais',
        description: 'Visão detalhada das despesas operacionais por centro de custo.',
        category: 'Financeiro',
        url: 'https://app.powerbi.com/view?r=example2',
        workspaceId: '',
        reportId: '',
        groupId: '',
        order: 2,
        active: true,
        visibility: 'all',
        groups: [],
        users: [],
        pinned: false,
        lastUpdate: '2026-02-16T14:00:00',
        createdAt: '2026-01-20T09:00:00'
    },
    {
        id: 3,
        name: 'Headcount & Turnover',
        description: 'Indicadores de headcount, turnover e absenteísmo por departamento.',
        category: 'RH',
        url: 'https://app.powerbi.com/view?r=example3',
        workspaceId: '',
        reportId: '',
        groupId: '',
        order: 3,
        active: true,
        visibility: 'groups',
        groups: ['RH'],
        users: [],
        pinned: false,
        lastUpdate: '2026-02-15T16:45:00',
        createdAt: '2026-01-22T10:00:00'
    },
    {
        id: 4,
        name: 'Clima Organizacional',
        description: 'Resultados da pesquisa de clima e engajamento dos colaboradores.',
        category: 'RH',
        url: 'https://app.powerbi.com/view?r=example4',
        workspaceId: '',
        reportId: '',
        groupId: '',
        order: 4,
        active: true,
        visibility: 'groups',
        groups: ['RH'],
        users: [],
        pinned: true,
        lastUpdate: '2026-02-14T11:20:00',
        createdAt: '2026-02-01T08:30:00'
    },
    {
        id: 5,
        name: 'Indicadores de Saúde',
        description: 'Monitoramento de sinistralidade, atestados e programas de saúde.',
        category: 'Saúde',
        url: 'https://app.powerbi.com/view?r=example5',
        workspaceId: '',
        reportId: '',
        groupId: '',
        order: 5,
        active: true,
        visibility: 'groups',
        groups: ['Saúde'],
        users: [],
        pinned: false,
        lastUpdate: '2026-02-13T09:15:00',
        createdAt: '2026-02-05T07:00:00'
    },
    {
        id: 6,
        name: 'Custos de Saúde',
        description: 'Análise de custos com plano de saúde, odontológico e benefícios.',
        category: 'Saúde',
        url: 'https://app.powerbi.com/view?r=example6',
        workspaceId: '',
        reportId: '',
        groupId: '',
        order: 6,
        active: true,
        visibility: 'all',
        groups: [],
        users: [],
        pinned: false,
        lastUpdate: '2026-02-12T13:50:00',
        createdAt: '2026-02-10T12:00:00'
    }
]

export const mockGroups = ['Financeiro', 'RH', 'Saúde', 'Jurídico', 'TI']

export const portalSettings = {
    name: 'Portal BOON',
    logo: null,
    primaryColor: '#7c3aed',
    secondaryColor: '#4c1d95'
}
