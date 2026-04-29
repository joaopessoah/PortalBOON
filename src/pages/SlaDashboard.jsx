import { useState, useEffect, useRef } from 'react'
import Header from '../components/Header'
import { AlertCircle, CheckCircle, Clock, Trophy, ClipboardList, TrendingUp, TrendingDown, Users, Timer, ArrowLeft, Activity, UserX, BarChart3, Zap, Target, Brain, X, CalendarCheck, Smile } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const MP = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const fm = ym => { const [y, m] = ym.split('-'); return MP[parseInt(m)-1] + '/' + y.slice(2) }
const fmt = n => Number(n).toLocaleString('pt-BR')
const fmtD = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-'
const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : 0

const cs = { padding: 20, borderRadius: 16, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }
const ts = { fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }

export default function SlaDashboard() {
    const { user } = useAuth()
    const [d, setD] = useState(null)
    const [est, setEst] = useState([])
    const [permissao, setPermissao] = useState(null) // { todas: true/false, estipulantes: [] }
    const [f, setF] = useState({ data_ini: '', data_fim: '', estipulante: '' })
    const [loading, setLoading] = useState(true)
    const [secao, setSecao] = useState('atendimentos')
    const modalRef = useRef(null)
    const modalBodyRef = useRef(null)
    const aiRef = useRef(null)
    const aiBtnRef = useRef(null)
    const ch = useRef({})

    useEffect(() => {
        const today = new Date().toISOString().slice(0,10)
        const dd = new Date(); dd.setFullYear(dd.getFullYear()-1); dd.setDate(1)
        setF(x => ({ ...x, data_ini: dd.toISOString().slice(0,10), data_fim: today }))
        // Buscar permissões do usuário
        if (user?.id) {
            fetch('/api/sla-dashboard/user-estipulantes/' + user.id).then(r=>r.json()).then(p => {
                setPermissao(p)
                // Se usuário tem apenas 1 estipulante, já filtra automaticamente
                if (!p.todas && p.estipulantes.length === 1) {
                    setF(x => ({ ...x, estipulante: p.estipulantes[0] }))
                }
            }).catch(()=>{})
            fetch('/api/sla-dashboard/estipulantes?user_id=' + user.id).then(r=>r.json()).then(setEst).catch(()=>{})
        } else {
            fetch('/api/sla-dashboard/estipulantes').then(r=>r.json()).then(setEst).catch(()=>{})
        }
    }, [])

    useEffect(() => { if (f.data_ini) load() }, [f])

    const q = () => {
        const p = new URLSearchParams()
        if (f.data_ini) p.set('data_ini', f.data_ini)
        if (f.data_fim) p.set('data_fim', f.data_fim)
        if (f.estipulante) p.set('estipulante', f.estipulante)
        const s = p.toString(); return s ? '?'+s : ''
    }

    // Query string específica do NPS (parametriza data_inicio/data_fim, não data_ini/data_fim, e injeta user_id)
    const qNps = () => {
        const p = new URLSearchParams()
        if (f.data_ini) p.set('data_inicio', f.data_ini)
        if (f.data_fim) p.set('data_fim', f.data_fim)
        if (f.estipulante) p.set('estipulante', f.estipulante)
        if (user?.id) p.set('user_id', user.id)
        const s = p.toString(); return s ? '?'+s : ''
    }

    const load = async () => {
        setLoading(true)
        const qs = q()
        try {
            const [kpis, porStatus, evolucao, porAssunto, foraPrazo, emAberto, taxaMensal, atKpis, atMes, atMotivo, assuntosVolume, porRisco, rankCríticos, anomalias, previsao, porDiaSemana, faixaEtaria, retencao, utilizacao, previsaoAssunto, assuntoFaixaEtaria, tabelaMensal, jornada, nps] = await Promise.all([
                fetch('/api/sla-dashboard/kpis'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/por-status'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/evolucao-mensal'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/por-assunto'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/top-fora-prazo'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/em-aberto'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/taxa-mensal'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/atend-kpis'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/atend-por-mes'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/atend-por-motivo'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/assuntos-volume'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/por-risco'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/ranking-criticos'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/anomalias'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/previsao'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/por-dia-semana'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/faixa-etaria'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/retencao'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/utilizacao'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/previsao-assunto'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/assunto-faixa-etaria'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/tabela-mensal'+qs).then(r=>r.json()),
                fetch('/api/sla-dashboard/jornada-paciente'+qs).then(r=>r.json()),
                fetch('/api/nps'+qNps()).then(r=>r.json()).catch(()=>null),
            ])
            // Calcular último mês completo vs média 3 meses
            const mesAtual = new Date().toISOString().slice(0,7)
            const mesesCompletos = atMes.filter(r => r.mes !== mesAtual)
            const ultMes = mesesCompletos.length > 0 ? mesesCompletos[mesesCompletos.length - 1] : null
            const ult3 = mesesCompletos.slice(-3)
            const media3m = ult3.length > 0 ? Math.round(ult3.reduce((a, r) => a + r.total, 0) / ult3.length) : 0
            const varUltMes = ultMes && media3m > 0 ? Math.round((ultMes.total - media3m) / media3m * 1000) / 10 : 0

            setD({ kpis, porStatus, evolucao, porAssunto, foraPrazo, emAberto, taxaMensal, atKpis, atMes, atMotivo, assuntosVolume, porRisco, rankCríticos, anomalias, previsao, ultMes, media3m, varUltMes, porDiaSemana, faixaEtaria, retencao, utilizacao, previsaoAssunto, assuntoFaixaEtaria, tabelaMensal, jornada, nps })
        } catch (err) { console.error(err) }
        setLoading(false)
    }

    const closeModal = () => { if(modalRef.current) modalRef.current.style.display='none' }
    const openDetail = (title, rows, columns) => {
        if(!modalRef.current||!modalBodyRef.current) return
        modalRef.current.style.display='flex'
        let html = `<div style="padding:16px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
            <h3 style="margin:0;font-size:16px;font-weight:700;color:#1a1a2e">${title} <span style="font-size:12px;font-weight:500;color:#aaa;margin-left:8px">${rows.length} registros</span></h3>
            <button onclick="this.closest('[data-modal]').style.display='none'" style="background:none;border:none;cursor:pointer;padding:4px;font-size:20px;color:#999">&times;</button>
        </div><div style="overflow:auto;padding:0 24px 24px"><table class="table" style="font-size:11px;margin-top:16px"><thead><tr>`
        columns.forEach(c => { html += `<th style="text-align:${c.align||'left'}">${c.label}</th>` })
        html += '</tr></thead><tbody>'
        if(rows.length===0) html += `<tr><td colspan="${columns.length}" style="text-align:center;color:#ccc;padding:24px">Nenhum registro</td></tr>`
        rows.forEach(r => {
            html += '<tr>'
            columns.forEach(c => {
                const val = c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '-')
                html += `<td style="text-align:${c.align||'left'}" title="${String(r[c.key]||'')}">${val}</td>`
            })
            html += '</tr>'
        })
        html += '</tbody></table></div>'
        modalBodyRef.current.innerHTML = html
    }

    useEffect(() => {
        if (!window.Chart || !d) return
        const C = window.Chart
        const kill = k => { if(ch.current[k]){ch.current[k].destroy();delete ch.current[k]} }
        const el = id => document.getElementById(id)

        // 1. Evolucao Atendimentos (sem faltas)
        kill('atMes')
        const atMesEl = el('chartAtMes')
        if (atMesEl && d.atMes.length) {
            ch.current.atMes = new C(atMesEl, {
                type: 'bar', data: { labels: d.atMes.map(r=>fm(r.mes)), datasets: [
                    { label: 'Realizados', data: d.atMes.map(r=>r.realizados), backgroundColor: '#22c55e', borderRadius: 3 },
                    { label: 'Em aberto', data: d.atMes.map(r=>r.total-r.realizados-r.faltas), backgroundColor: '#f59e0b', borderRadius: 3 },
                ]},
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position:'top', labels:{usePointStyle:true,font:{size:11}}}}, scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:'rgba(0,0,0,0.04)'}}} }
            })
        }

        // 2. Motivo baixa doughnut (sem faltas)
        kill('motivo')
        const motEl = el('chartMotivo')
        if (motEl && d.atMotivo.length) {
            const filtered = d.atMotivo.filter(r => r.motivo !== 'FALTA DO PACIENTE')
            const cols = ['#22c55e','#f59e0b','#3b82f6','#8b5cf6','#06b6d4','#ec4899','#6b7280']
            ch.current.motivo = new C(motEl, {
                type: 'doughnut', data: { labels: filtered.map(r=>r.motivo), datasets:[{data:filtered.map(r=>r.total), backgroundColor:cols, borderWidth:0}]},
                options: { responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'right',labels:{padding:12,usePointStyle:true,font:{size:11,weight:500}}}}}
            })
        }

        // 3. SLA Status doughnut
        kill('slaStatus')
        const slaEl = el('chartSlaStatus')
        if (slaEl) {
            const cols = {'Dentro do prazo':'#22c55e','Fora do prazo':'#ef4444','Em atendimento - Dentro do prazo':'#f59e0b','Em atendimento - Fora do prazo':'#f97316'}
            const fl = d.porStatus.filter(r=>r.status_sla!=='Aguardando Cadastro de SLA')
            ch.current.slaStatus = new C(slaEl, {
                type: 'doughnut', data: { labels:fl.map(r=>r.status_sla), datasets:[{data:fl.map(r=>r.total),backgroundColor:fl.map(r=>cols[r.status_sla]||'#9ca3af'),borderWidth:0}]},
                options: { responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'right',labels:{padding:12,usePointStyle:true,font:{size:11,weight:500}}}}}
            })
        }

        // 4. Taxa cumprimento mensal
        kill('taxa')
        const taxaEl = el('chartTaxa')
        if (taxaEl && d.taxaMensal.length) {
            ch.current.taxa = new C(taxaEl, {
                type: 'line', data: { labels: d.taxaMensal.map(r=>fm(r.mes)), datasets:[
                    { label:'Taxa %', data:d.taxaMensal.map(r=>r.taxa), borderColor:'#6B2A8C', backgroundColor:'rgba(107,42,140,0.06)', fill:true, tension:0.4, borderWidth:2.5, pointRadius:4, pointBackgroundColor:'#6B2A8C', pointBorderColor:'#fff', pointBorderWidth:2 }
                ]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.parsed.y+'%'}}}, scales:{y:{min:0,max:100,grid:{color:'rgba(0,0,0,0.04)'},ticks:{callback:v=>v+'%'}},x:{grid:{display:false}}}}
            })
        }

        // 5. Volume SLA mensal
        kill('slaEvol')
        const evolEl = el('chartSlaEvol')
        if (evolEl && d.evolucao.length) {
            ch.current.slaEvol = new C(evolEl, {
                type: 'bar', data: { labels:d.evolucao.map(r=>fm(r.mes)), datasets:[
                    { label:'Dentro', data:d.evolucao.map(r=>r.dentro), backgroundColor:'#22c55e', borderRadius:3 },
                    { label:'Fora', data:d.evolucao.map(r=>r.fora), backgroundColor:'#ef4444', borderRadius:3 },
                ]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{usePointStyle:true,font:{size:11}}}}, scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:'rgba(0,0,0,0.04)'}}}}
            })
        }

        // 6. Assunto
        kill('assunto')
        const assEl = el('chartAssunto')
        if (assEl && d.porAssunto.length) {
            ch.current.assunto = new C(assEl, {
                type: 'bar', data: { labels:d.porAssunto.map(r=>r.assunto.length>50?r.assunto.slice(0,50)+'...':r.assunto), datasets:[
                    { label:'Dentro', data:d.porAssunto.map(r=>r.dentro), backgroundColor:'#22c55e' },
                    { label:'Fora', data:d.porAssunto.map(r=>r.fora), backgroundColor:'#ef4444' },
                    { label:'Em atend.', data:d.porAssunto.map(r=>r.em_atendimento), backgroundColor:'#f59e0b' },
                ]},
                options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{usePointStyle:true,font:{size:11}}}}, scales:{x:{stacked:true,grid:{color:'rgba(0,0,0,0.04)'}},y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}}}}
            })
        }

        // 7. Por Risco
        kill('risco')
        const rscEl = el('chartRisco')
        if (rscEl && d.porRisco?.length) {
            ch.current.risco = new C(rscEl, {
                type: 'bar', data: { labels:d.porRisco.map(r=>r.grau), datasets:[
                    { label:'Dentro', data:d.porRisco.map(r=>r.dentro), backgroundColor:'#22c55e' },
                    { label:'Fora', data:d.porRisco.map(r=>r.fora), backgroundColor:'#ef4444' },
                    { label:'Em atend.', data:d.porRisco.map(r=>r.em_atendimento), backgroundColor:'#f59e0b' },
                    { label:'Sem SLA', data:d.porRisco.map(r=>r.sem_sla), backgroundColor:'#e5e7eb' },
                ]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{usePointStyle:true,font:{size:11}}}}, scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:'rgba(0,0,0,0.04)'}}}}
            })
        }

        // Dia da semana
        kill('dow')
        const dowEl = el('chartDow')
        const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']
        const dowColors = ['#8b5cf6','#3b82f6','#10b981','#06b6d4','#f59e0b','#ec4899','#ef4444']
        if (dowEl && d.porDiaSemana?.length) {
            ch.current.dow = new C(dowEl, {
                type: 'bar', data: { labels:d.porDiaSemana.map(r=>DIAS[r.dow]), datasets:[{data:d.porDiaSemana.map(r=>r.total), backgroundColor:d.porDiaSemana.map((r)=>dowColors[r.dow]+'99'), borderColor:d.porDiaSemana.map(r=>dowColors[r.dow]), borderWidth:1, borderRadius:8}]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const r=d.porDiaSemana[ctx.dataIndex];return fmt(r.total)+' ('+r.percentual+'%)'}}}}, scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.04)'}},x:{grid:{display:false}}}}
            })
        }

        // Faixa etária
        kill('idade')
        const idEl = el('chartIdade')
        if (idEl && d.faixaEtaria?.length) {
            ch.current.idade = new C(idEl, {
                type: 'bar', data: { labels:d.faixaEtaria.map(r=>r.faixa), datasets:[{data:d.faixaEtaria.map(r=>r.total), backgroundColor:['#06b6d4','#3b82f6','#8b5cf6','#ec4899','#f59e0b','#ef4444','#10b981'], borderRadius:8}]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>fmt(ctx.parsed.y)+' atendimentos'}}}, scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.04)'}},x:{grid:{display:false}}}}
            })
        }

        // Utilização beneficiários
        kill('util')
        const utilEl = el('chartUtil')
        if (utilEl && d.utilizacao?.length) {
            ch.current.util = new C(utilEl, {
                type: 'line', data: { labels:d.utilizacao.map(r=>fm(r.mes)), datasets:[
                    { label:'Pacientes', data:d.utilizacao.map(r=>r.beneficiarios), borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.06)', fill:true, tension:0.4, borderWidth:2, pointRadius:3, yAxisID:'y' },
                    { label:'Atend/Paciente', data:d.utilizacao.map(r=>r.media_atend_por_benef), borderColor:'#f59e0b', borderWidth:2.5, tension:0.4, pointRadius:4, pointBackgroundColor:'#f59e0b', pointBorderColor:'#fff', pointBorderWidth:2, yAxisID:'y1' },
                ]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{usePointStyle:true,font:{size:11}}}}, scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.04)'},title:{display:true,text:'Pacientes',font:{size:10}}},y1:{position:'right',beginAtZero:true,grid:{display:false},title:{display:true,text:'Média atend/paciente',font:{size:10}}},x:{grid:{display:false}}}}
            })
        }

        // Retenção segmentos
        kill('retencao')
        const retEl = el('chartRetencao')
        if (retEl && d.retencao?.segmentos?.length) {
            ch.current.retencao = new C(retEl, {
                type: 'doughnut', data: { labels:d.retencao.segmentos.map(r=>r.segmento), datasets:[{data:d.retencao.segmentos.map(r=>r.pacientes), backgroundColor:['#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ef4444'], borderWidth:0}]},
                options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{legend:{position:'right',labels:{padding:12,usePointStyle:true,font:{size:11,weight:500}}}}}
            })
        }

        // Assunto x Faixa Etária (heatmap-like stacked bar)
        kill('assFaixa')
        const afEl = el('chartAssFaixa')
        if (afEl && d.assuntoFaixaEtaria?.length) {
            const faixas = ['0-17','18-25','26-35','36-45','46-55','56-65','65+']
            const graus = [...new Set(d.assuntoFaixaEtaria.map(r=>r.grau))].sort()
            const faixaCols = {'0-17':'#06b6d4','18-25':'#3b82f6','26-35':'#8b5cf6','36-45':'#ec4899','46-55':'#f59e0b','56-65':'#ef4444','65+':'#10b981'}
            ch.current.assFaixa = new C(afEl, {
                type: 'bar', data: { labels:graus, datasets:faixas.map(fx=>({
                    label:fx, data:graus.map(g=>{const r=d.assuntoFaixaEtaria.find(x=>x.grau===g&&x.faixa===fx);return r?r.total:0}), backgroundColor:faixaCols[fx]
                }))},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{usePointStyle:true,font:{size:10}}}}, scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:'rgba(0,0,0,0.04)'}}}}
            })
        }

        // 8. Anomalias
        kill('anomalia')
        const anoEl = el('chartAnomalia')
        if (anoEl && d.anomalias?.diario?.length) {
            const media = d.anomalias.stats.media
            const anomDias = d.anomalias.anomalias.map(a => a.dia)
            ch.current.anomalia = new C(anoEl, {
                type: 'bar', data: { labels:d.anomalias.diario.map(r=>{const dt=new Date(r.dia);return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}), datasets:[
                    { label:'Volume diário', data:d.anomalias.diario.map(r=>r.total), backgroundColor:d.anomalias.diario.map(r=>anomDias.includes(r.dia)?(r.total>media?'rgba(239,68,68,0.7)':'rgba(59,130,246,0.7)'):'rgba(107,42,140,0.3)'), borderRadius:2 },
                ]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{grid:{color:'rgba(0,0,0,0.04)'}},x:{grid:{display:false},ticks:{maxRotation:45,font:{size:9}}}}}
            })
        }

        // 9. Previsao
        kill('prev')
        const prevEl = el('chartPrevisao')
        if (prevEl && d.previsao?.historico?.length) {
            const hist = d.previsao.historico
            const prev = d.previsao.previsao
            const allLabels = [...hist.map(r=>fm(r.mes)), ...prev.map(r=>fm(r.mes))]
            const histData = [...hist.map(r=>r.total), ...prev.map(()=>null)]
            const prevData = [...hist.map((_,i)=>i===hist.length-1?hist[i].total:null), ...prev.map(r=>r.total)]
            ch.current.prev = new C(prevEl, {
                type: 'line', data: { labels:allLabels, datasets:[
                    { label:'Histórico', data:histData, borderColor:'#6B2A8C', backgroundColor:'rgba(107,42,140,0.06)', fill:true, tension:0.4, borderWidth:2.5, pointRadius:3, pointBackgroundColor:'#6B2A8C' },
                    { label:'Previsao', data:prevData, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.06)', fill:true, tension:0.4, borderWidth:2.5, borderDash:[6,4], pointRadius:4, pointBackgroundColor:'#f59e0b', pointBorderColor:'#fff', pointBorderWidth:2 },
                ]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{usePointStyle:true,font:{size:11}}}}, scales:{y:{grid:{color:'rgba(0,0,0,0.04)'}},x:{grid:{display:false}}}}
            })
        }

        // Jornada: distribuição retorno
        kill('retDist')
        const retDistEl = el('chartRetDist')
        if (retDistEl && d.jornada?.dist_retorno?.length) {
            ch.current.retDist = new C(retDistEl, {
                type: 'bar', data: { labels:d.jornada.dist_retorno.map(r=>r.faixa), datasets:[{data:d.jornada.dist_retorno.map(r=>r.total), backgroundColor:['#6B2A8C','#3b82f6','#22c55e','#f59e0b','#f97316','#ef4444','#9ca3af'], borderRadius:6}]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>fmt(ctx.parsed.y)+' retornos'}}}, scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.04)'}},x:{grid:{display:false}}}}
            })
        }

        // Jornada: frequência pacientes
        kill('freqPac')
        const freqEl = el('chartFreqPac')
        if (freqEl && d.jornada?.freq_pacientes?.length) {
            const fp = d.jornada.freq_pacientes.slice(0, 15)
            ch.current.freqPac = new C(freqEl, {
                type: 'bar', data: { labels:fp.map(r=>r.cnt+' atend.'), datasets:[{data:fp.map(r=>r.pacientes), backgroundColor:'rgba(107,42,140,0.5)', borderRadius:4}]},
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>fmt(ctx.parsed.y)+' pacientes'}}}, scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.04)'}},x:{grid:{display:false}}}}
            })
        }

        return () => Object.keys(ch.current).forEach(kill)
    }, [d, secao])

    const loadAi = async () => {
        if (aiBtnRef.current) { aiBtnRef.current.disabled = true; aiBtnRef.current.textContent = 'Analisando...' }
        if (aiRef.current) aiRef.current.innerHTML = '<div style="text-align:center;padding:30px;color:#999;font-size:13px">A IA está analisando seus dados... isso pode levar alguns segundos.</div>'
        try {
            const qs2 = q()
            const res = await fetch('/api/sla-dashboard/ai-insights' + qs2, { method: 'POST' })
            const json = await res.json()
            if (aiRef.current) {
                if (json.error) aiRef.current.innerHTML = `<p style="color:#ef4444">${json.error}</p>`
                else aiRef.current.innerHTML = json.html
            }
        } catch (err) { if (aiRef.current) aiRef.current.innerHTML = `<p style="color:#ef4444">Erro: ${err.message}</p>` }
        if (aiBtnRef.current) { aiBtnRef.current.disabled = false; aiBtnRef.current.textContent = 'Gerar Análise' }
    }

    if (loading||!d) return <div><Header /><div style={{textAlign:'center',padding:80,color:'#aaa'}}>Carregando dashboard...</div></div>
    const k = d.kpis, ak = d.atKpis

    const KPI = ({label,value,sub,icon:Icon,color,onClick}) => (
        <div style={{...cs, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.2s'}} onClick={onClick}
            onMouseEnter={e => { if(onClick) e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:700,color:'#999',textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</span>
                <div style={{width:30,height:30,borderRadius:8,background:color+'12',display:'flex',alignItems:'center',justifyContent:'center'}}><Icon size={15} color={color}/></div>
            </div>
            <div style={{fontSize:26,fontWeight:800,color:'#1a1a2e',lineHeight:1}}>{value}</div>
            <div style={{fontSize:11,color:'#aaa',marginTop:5}}>{sub}</div>
            {onClick && <div style={{fontSize:9,color:'#bbb',marginTop:6}}>Clique para ver detalhes</div>}
        </div>
    )

    const Section = ({title,children}) => (
        <div style={{marginBottom:32}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                <div style={{width:3,height:24,borderRadius:3,background:'linear-gradient(180deg,#6B2A8C,#FBC02D)'}}/>
                <h2 style={{fontSize:16,fontWeight:700,color:'#1a1a2e',margin:0}}>{title}</h2>
            </div>
            {children}
        </div>
    )

    // Prepare detail data for clickable cards
    const detailCols = [
        { key: 'smpesfis_nome', label: 'Paciente' },
        { key: 'assunto', label: 'Assunto' },
        { key: 'data_atendimento', label: 'Data', fmt: fmtD },
        { key: 'motivo_baixa', label: 'Status' },
        { key: 'estipulante_razao', label: 'Estipulante' },
    ]

    const openCardDetail = async (title, tipo) => {
        openDetail(title, [], detailCols)
        try {
            const res = await fetch('/api/sla-dashboard/detalhe/' + tipo + q())
            const rows = await res.json()
            openDetail(title, rows, detailCols)
        } catch(err) { openDetail(title + ' - Erro', [], detailCols) }
    }

    const openSlaDetail = (title, status) => {
        openDetail(title, d.emAberto.filter(r => status === 'all' || r.status_sla?.includes(status)), [
            { key: 'smpesfis_nome', label: 'Paciente' },
            { key: 'assunto', label: 'Assunto' },
            { key: 'data_atendimento', label: 'Data', fmt: fmtD },
            { key: 'data_prazo_sla', label: 'Prazo', fmt: fmtD },
            { key: 'dias_uteis', label: 'Dias', align: 'center' },
            { key: 'status_sla', label: 'Status' },
        ])
    }

    const varIcon = d.varUltMes >= 0 ? '▲' : '▼'
    const varColor = d.varUltMes >= 0 ? '#22c55e' : '#ef4444'

    return (
        <div style={{background:'#fafafa',minHeight:'100vh'}}>
            <Header />
            <div style={{padding:'20px 28px',maxWidth:1540,margin:'0 auto'}}>
                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28}}>
                    <div>
                        <Link to="/dashboards" style={{color:'#aaa',fontSize:12,textDecoration:'none',display:'flex',alignItems:'center',gap:4,marginBottom:6}}><ArrowLeft size={14}/>Dashboards</Link>
                        <h1 style={{fontSize:26,fontWeight:800,color:'#1a1a2e',margin:0}}>Amar & Cuidar</h1>
                        <p style={{color:'#999',fontSize:13,marginTop:4}}>Painel de atendimentos e controle de SLA</p>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                        <div>
                            <label style={{fontSize:9,color:'#bbb',display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:700}}>Início</label>
                            <input type="date" className="form-input" value={f.data_ini} onChange={e=>setF({...f,data_ini:e.target.value})} style={{width:140,fontSize:12,padding:'6px 10px'}}/>
                        </div>
                        <div>
                            <label style={{fontSize:9,color:'#bbb',display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:700}}>Fim</label>
                            <input type="date" className="form-input" value={f.data_fim} onChange={e=>setF({...f,data_fim:e.target.value})} style={{width:140,fontSize:12,padding:'6px 10px'}}/>
                        </div>
                        {/* Estipulante - oculto se usuário tem apenas 1 */}
                        {!(permissao && !permissao.todas && permissao.estipulantes.length === 1) && (
                        <div>
                            <label style={{fontSize:9,color:'#bbb',display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:700}}>Estipulante</label>
                            <select className="form-input" value={f.estipulante} onChange={e=>setF({...f,estipulante:e.target.value})} style={{width:200,fontSize:12,padding:'6px 10px'}}>
                                {(permissao?.todas || !permissao) && <option value="">Todos</option>}
                                {est.map(e=><option key={e} value={e}>{e}</option>)}
                            </select>
                        </div>
                        )}
                    </div>
                </div>

                {/* Menu de navegação */}
                <div style={{display:'flex',gap:4,marginBottom:24,background:'#fff',borderRadius:12,padding:4,boxShadow:'0 1px 3px rgba(0,0,0,0.06)',border:'1px solid #f0f0f0',position:'sticky',top:0,zIndex:10}}>
                    {[
                        {id:'atendimentos',label:'Atendimentos',icon:ClipboardList},
                        {id:'jornada',label:'Jornada do Paciente',icon:Users},
                        {id:'sla',label:'Controle de SLA',icon:Trophy},
                        {id:'assuntos',label:'Assuntos e Análises',icon:BarChart3},
                        {id:'nps',label:'NPS',icon:Smile},
                        {id:'ia',label:'Análise com IA',icon:Brain},
                    ].map(tab => {
                        const Icon = tab.icon
                        const active = secao === tab.id
                        return (
                            <button key={tab.id} onClick={()=>setSecao(tab.id)} style={{
                                flex:1, padding:'10px 16px', borderRadius:8, border:'none', cursor:'pointer',
                                background: active ? '#6B2A8C' : 'transparent',
                                color: active ? '#fff' : '#888',
                                fontWeight: active ? 700 : 500,
                                fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                                transition:'all 0.2s'
                            }}>
                                <Icon size={14}/> {tab.label}
                            </button>
                        )
                    })}
                </div>

                {/* ═══════ ATENDIMENTOS ═══════ */}
                {secao === 'atendimentos' && <Section title="Atendimentos">
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:16}}>
                        <KPI label="Total" value={fmt(ak.total)} sub="Atendimentos no período" icon={ClipboardList} color="#6B2A8C"
                            onClick={() => openCardDetail('Todos os Atendimentos', 'total')} />
                        <KPI label="Realizados" value={fmt(ak.realizados)} sub={ak.taxa_realizacao+'% do total'} icon={CheckCircle} color="#22c55e"
                            onClick={() => openCardDetail('Atendimentos Realizados', 'realizados')} />
                        <KPI label="Em Aberto" value={fmt(ak.abertos)} sub="Sem baixa" icon={Clock} color="#f59e0b"
                            onClick={() => openCardDetail('Atendimentos em Aberto', 'abertos')} />
                        <KPI label={d.ultMes ? `Último Mês (${fm(d.ultMes.mes)})` : 'Último Mês'} value={d.ultMes ? fmt(d.ultMes.total) : '-'}
                            sub={<span>Média 3m: {fmt(d.media3m)} <span style={{color:varColor,fontWeight:700}}>{varIcon} {Math.abs(d.varUltMes)}%</span></span>}
                            icon={CalendarCheck} color="#3b82f6"
                            onClick={() => openCardDetail('Atendimentos do Último Mês', 'ultimo-mes')} />
                    </div>

                    <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:14,marginBottom:16}}>
                        <div style={cs}>
                            <div style={ts}><Activity size={14} color="#3b82f6"/> Evolução Mensal de Atendimentos</div>
                            <div style={{height:260}}><canvas id="chartAtMes"></canvas></div>
                        </div>
                        <div style={cs}>
                            <div style={ts}><CheckCircle size={14} color="#22c55e"/> Status dos Atendimentos</div>
                            <div style={{height:260}}><canvas id="chartMotivo"></canvas></div>
                        </div>
                    </div>
                    {/* Tabela mês a mês */}
                    {d.tabelaMensal?.length > 0 && (
                        <div style={{...cs,marginBottom:16}}>
                            <div style={ts}><CalendarCheck size={14} color="#6B2A8C"/> Acompanhamento Mês a Mês</div>
                            <div style={{maxHeight:400,overflow:'auto'}}>
                                <table className="table" style={{fontSize:11}}>
                                    <thead>
                                        <tr>
                                            <th>Mês</th>
                                            <th style={{textAlign:'center'}}>Atendimentos</th>
                                            <th style={{textAlign:'center'}}>Média 3m Ant.</th>
                                            <th style={{textAlign:'center'}}>Var. %</th>
                                            <th style={{textAlign:'center'}}>Pacientes</th>
                                            <th style={{textAlign:'center'}}>Média 3m Ant.</th>
                                            <th style={{textAlign:'center'}}>Var. %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.tabelaMensal.map((r,i) => (
                                            <tr key={i}>
                                                <td style={{fontWeight:600}}>{fm(r.mes)}</td>
                                                <td style={{textAlign:'center',fontWeight:600}}>{fmt(r.atendimentos)}</td>
                                                <td style={{textAlign:'center',color:'#888'}}>{r.media_atend_3m != null ? fmt(r.media_atend_3m) : '-'}</td>
                                                <td style={{textAlign:'center'}}>
                                                    {r.var_atend != null ? (
                                                        <span style={{padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,
                                                            background:r.var_atend>5?'#22c55e15':r.var_atend<-5?'#ef444415':'#f59e0b15',
                                                            color:r.var_atend>5?'#22c55e':r.var_atend<-5?'#ef4444':'#f59e0b'}}>
                                                            {r.var_atend>0?'+':''}{r.var_atend}%
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td style={{textAlign:'center',fontWeight:600}}>{fmt(r.beneficiarios)}</td>
                                                <td style={{textAlign:'center',color:'#888'}}>{r.media_benef_3m != null ? fmt(r.media_benef_3m) : '-'}</td>
                                                <td style={{textAlign:'center'}}>
                                                    {r.var_benef != null ? (
                                                        <span style={{padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,
                                                            background:r.var_benef>5?'#22c55e15':r.var_benef<-5?'#ef444415':'#f59e0b15',
                                                            color:r.var_benef>5?'#22c55e':r.var_benef<-5?'#ef4444':'#f59e0b'}}>
                                                            {r.var_benef>0?'+':''}{r.var_benef}%
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Dia da semana + Faixa etária */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:16}}>
                        <div style={cs}>
                            <div style={ts}><Activity size={14} color="#8b5cf6"/> Atendimentos por Dia da Semana</div>
                            <div style={{height:260}}><canvas id="chartDow"></canvas></div>
                        </div>
                        <div style={cs}>
                            <div style={ts}><Users size={14} color="#06b6d4"/> Atendimentos por Faixa Etária</div>
                            <div style={{height:260}}><canvas id="chartIdade"></canvas></div>
                        </div>
                    </div>

                </Section>}

                {/* ═══════ JORNADA ═══════ */}
                {secao === 'jornada' && d.jornada && (
                <Section title="Jornada do Paciente">
                    {/* KPIs jornada */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:16}}>
                        <KPI label="Total de Retornos" value={fmt(d.jornada.total_retornos)} sub="Atendimentos consecutivos" icon={Activity} color="#6B2A8C"/>
                        <KPI label="Tempo Médio de Retorno" value={d.jornada.media_retorno+' dias'} sub="Entre atendimentos" icon={Clock} color="#3b82f6"/>
                        <KPI label="Mediana de Retorno" value={d.jornada.mediana_retorno+' dias'} sub="Valor central" icon={Timer} color="#8b5cf6"/>
                        <KPI label="Visita Única" value={fmt(d.jornada.visita_unica)} sub="Vieram apenas 1 vez" icon={UserX} color="#f59e0b"/>
                        <KPI label="Recorrentes" value={fmt(d.jornada.visitas_multiplas)} sub="Vieram 2+ vezes" icon={Users} color="#22c55e"/>
                    </div>

                    {/* Charts */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                        <div style={cs}>
                            <div style={ts}><Clock size={14} color="#3b82f6"/> Tempo até o Retorno</div>
                            <div style={{height:260}}><canvas id="chartRetDist"></canvas></div>
                        </div>
                        <div style={cs}>
                            <div style={ts}><Users size={14} color="#6B2A8C"/> Frequência de Atendimentos por Paciente</div>
                            <div style={{height:260}}><canvas id="chartFreqPac"></canvas></div>
                        </div>
                    </div>

                    {/* Retorno por assunto + Sem retorno */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                        <div style={cs}>
                            <div style={ts}><TrendingUp size={14} color="#f59e0b"/> Tempo de Retorno por Assunto <span style={{marginLeft:'auto',fontSize:11,fontWeight:500,color:'#aaa'}}>Top 10</span></div>
                            <div style={{maxHeight:320,overflow:'auto'}}>
                                <table className="table" style={{fontSize:11}}>
                                    <thead><tr><th>Assunto</th><th style={{textAlign:'center'}}>Retornos</th><th style={{textAlign:'center'}}>Média</th><th style={{textAlign:'center'}}>Mín</th><th style={{textAlign:'center'}}>Máx</th></tr></thead>
                                    <tbody>
                                        {d.jornada.retorno_assunto?.map((r,i) => (
                                            <tr key={i}>
                                                <td title={r.assunto} style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.assunto}</td>
                                                <td style={{textAlign:'center',fontWeight:600}}>{fmt(r.retornos)}</td>
                                                <td style={{textAlign:'center',color:'#3b82f6',fontWeight:600}}>{r.media_dias} dias</td>
                                                <td style={{textAlign:'center',color:'#22c55e',fontSize:10}}>{r.min_dias}d</td>
                                                <td style={{textAlign:'center',color:'#ef4444',fontSize:10}}>{r.max_dias}d</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div style={cs}>
                            <div style={ts}><AlertCircle size={14} color="#ef4444"/> Pacientes sem Retorno <span style={{marginLeft:'auto',fontSize:11,fontWeight:500,color:'#aaa'}}>60+ dias, 2+ atendimentos</span></div>
                            <div style={{maxHeight:320,overflow:'auto'}}>
                                <table className="table" style={{fontSize:11}}>
                                    <thead><tr><th>Paciente</th><th style={{textAlign:'center'}}>Atend.</th><th style={{textAlign:'center'}}>Último</th><th style={{textAlign:'center'}}>Dias sem retorno</th></tr></thead>
                                    <tbody>
                                        {d.jornada.sem_retorno?.length === 0 && <tr><td colSpan={4} style={{textAlign:'center',color:'#ccc',padding:20}}>Nenhum paciente sem retorno</td></tr>}
                                        {d.jornada.sem_retorno?.map((r,i) => (
                                            <tr key={i}>
                                                <td style={{fontWeight:500}}>{r.smpesfis_nome}</td>
                                                <td style={{textAlign:'center'}}>{r.total_atend}</td>
                                                <td style={{textAlign:'center'}}>{fmtD(r.ultimo_atend)}</td>
                                                <td style={{textAlign:'center'}}><span style={{padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,background:r.dias_sem_retorno>90?'#ef444415':'#f59e0b15',color:r.dias_sem_retorno>90?'#ef4444':'#f59e0b'}}>{r.dias_sem_retorno} dias</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Utilização + Retenção */}
                    <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:14,marginTop:14}}>
                        <div style={cs}>
                            <div style={ts}><TrendingUp size={14} color="#3b82f6"/> Utilização de Pacientes</div>
                            <div style={{height:260}}><canvas id="chartUtil"></canvas></div>
                        </div>
                        <div style={cs}>
                            <div style={ts}><Users size={14} color="#8b5cf6"/> Retenção de Pacientes</div>
                            {d.retencao && (
                                <div style={{display:'flex',gap:12,marginBottom:12}}>
                                    <div style={{flex:1,padding:'8px 10px',borderRadius:8,background:'#fafafa',textAlign:'center'}}>
                                        <div style={{fontSize:9,color:'#bbb',textTransform:'uppercase',fontWeight:700}}>Total pacientes</div>
                                        <div style={{fontSize:18,fontWeight:700,color:'#1a1a2e'}}>{fmt(d.retencao.total_pacientes)}</div>
                                    </div>
                                    <div style={{flex:1,padding:'8px 10px',borderRadius:8,background:'#fafafa',textAlign:'center'}}>
                                        <div style={{fontSize:9,color:'#bbb',textTransform:'uppercase',fontWeight:700}}>Recorrentes</div>
                                        <div style={{fontSize:18,fontWeight:700,color:'#22c55e'}}>{fmt(d.retencao.recorrentes)}</div>
                                    </div>
                                    <div style={{flex:1,padding:'8px 10px',borderRadius:8,background:'#fafafa',textAlign:'center'}}>
                                        <div style={{fontSize:9,color:'#bbb',textTransform:'uppercase',fontWeight:700}}>Taxa retenção</div>
                                        <div style={{fontSize:18,fontWeight:700,color:'#8b5cf6'}}>{d.retencao.taxa_retencao}%</div>
                                    </div>
                                </div>
                            )}
                            <div style={{height:180}}><canvas id="chartRetencao"></canvas></div>
                        </div>
                    </div>
                </Section>
                )}

                {/* ═══════ SLA ═══════ */}

                {secao === 'sla' && <Section title="Controle de SLA">
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:16}}>
                        <KPI label="Dentro do Prazo" value={fmt(k.dentro_prazo)} sub={pct(k.dentro_prazo,k.com_sla)+'%'} icon={CheckCircle} color="#22c55e"
                            onClick={() => openSlaDetail('Dentro do Prazo', 'all')} />
                        <KPI label="Fora do Prazo" value={fmt(k.fora_prazo)} sub={pct(k.fora_prazo,k.com_sla)+'%'} icon={AlertCircle} color="#ef4444"
                            onClick={() => openSlaDetail('Fora do Prazo', 'Fora')} />
                        <KPI label="Em Atendimento" value={fmt(k.em_atendimento_dentro+k.em_atendimento_fora)} sub={k.em_atendimento_fora+' atrasados'} icon={Clock} color="#f59e0b"
                            onClick={() => openSlaDetail('Em Atendimento', 'Em atendimento')} />
                        <KPI label="SLA" value={k.taxa_cumprimento+'%'} sub={k.taxa_cumprimento>=90?'Excelente':k.taxa_cumprimento>=70?'Atenção':'Crítico'} icon={Trophy} color={k.taxa_cumprimento>=90?'#22c55e':k.taxa_cumprimento>=70?'#f59e0b':'#ef4444'}/>
                    </div>

                    <div style={{display:'grid',gridTemplateColumns:'340px 1fr',gap:14,marginBottom:14}}>
                        <div style={cs}>
                            <div style={ts}><CheckCircle size={14} color="#22c55e"/> Status SLA</div>
                            <div style={{height:250}}><canvas id="chartSlaStatus"></canvas></div>
                        </div>
                        <div style={cs}>
                            <div style={ts}><TrendingUp size={14} color="#6B2A8C"/> Taxa de Cumprimento Mensal</div>
                            <div style={{height:250}}><canvas id="chartTaxa"></canvas></div>
                        </div>
                    </div>

                    <div style={{...cs,marginBottom:14}}>
                        <div style={ts}><ClipboardList size={14} color="#3b82f6"/> Volume Mensal (Dentro vs Fora)</div>
                        <div style={{height:270}}><canvas id="chartSlaEvol"></canvas></div>
                    </div>

                    <div style={{...cs,marginBottom:14}}>
                        <div style={ts}><AlertCircle size={14} color="#f59e0b"/> SLA por Assunto</div>
                        <div style={{height:Math.max(350,d.porAssunto.length*30)}}><canvas id="chartAssunto"></canvas></div>
                    </div>

                    <div style={cs}>
                        <div style={ts}><Clock size={14} color="#f59e0b"/> Atendimentos em Aberto <span style={{marginLeft:'auto',fontSize:11,fontWeight:500,color:'#aaa'}}>{d.emAberto.length} registros</span></div>
                        <div style={{maxHeight:340,overflow:'auto'}}>
                            <table className="table" style={{fontSize:11}}>
                                <thead><tr><th>Paciente</th><th>Assunto</th><th>Data</th><th>Prazo</th><th>Dias</th><th>Status</th></tr></thead>
                                <tbody>
                                    {d.emAberto.length===0&&<tr><td colSpan={6} style={{textAlign:'center',color:'#ccc',padding:24}}>Nenhum em aberto</td></tr>}
                                    {d.emAberto.map((r,i) => {
                                        const late = r.status_sla?.includes('Fora')
                                        return <tr key={i}>
                                            <td style={{fontWeight:500}}>{r.smpesfis_nome||'-'}</td>
                                            <td title={r.assunto} style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.assunto||'-'}</td>
                                            <td>{fmtD(r.atendimento)}</td>
                                            <td>{fmtD(r.data_prazo_sla)}</td>
                                            <td style={{fontWeight:700,color:late?'#ef4444':'#f59e0b'}}>{r.dias_uteis}d úteis</td>
                                            <td><span className={`badge ${late?'badge-error':'badge-success'}`} style={{fontSize:9,padding:'2px 6px'}}>{late?'Atrasado':'No prazo'}</span></td>
                                        </tr>
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Section>}

                {/* ═══════ ASSUNTOS & ANÁLISES ═══════ */}
                {secao === 'assuntos' && <Section title="Assuntos e Análises Avançadas">
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                        <div style={cs}>
                            <div style={ts}><Target size={14} color="#ef4444"/> Volume por Grau de Risco</div>
                            <div style={{height:280}}><canvas id="chartRisco"></canvas></div>
                        </div>
                        <div style={cs}>
                            <div style={ts}><AlertCircle size={14} color="#ef4444"/> Ranking Assuntos Críticos <span style={{marginLeft:'auto',fontSize:11,fontWeight:500,color:'#aaa'}}>Maior taxa fora do prazo</span></div>
                            <div style={{maxHeight:280,overflow:'auto'}}>
                                <table className="table" style={{fontSize:11}}>
                                    <thead><tr><th>Assunto</th><th style={{textAlign:'center'}}>Total</th><th style={{textAlign:'center'}}>Fora</th><th style={{textAlign:'center'}}>Taxa</th><th style={{textAlign:'center'}}>Atraso Med.</th></tr></thead>
                                    <tbody>
                                        {d.rankCríticos?.map((r,i) => <tr key={i}>
                                            <td title={r.assunto} style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:i<3?600:400}}>{r.assunto}</td>
                                            <td style={{textAlign:'center'}}>{fmt(r.total)}</td>
                                            <td style={{textAlign:'center',color:'#ef4444',fontWeight:600}}>{fmt(r.fora_total)}</td>
                                            <td style={{textAlign:'center'}}><span style={{padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,background:r.taxa_fora>20?'#ef444415':r.taxa_fora>10?'#f59e0b15':'#22c55e15',color:r.taxa_fora>20?'#ef4444':r.taxa_fora>10?'#f59e0b':'#22c55e'}}>{r.taxa_fora}%</span></td>
                                            <td style={{textAlign:'center',fontSize:10,color:'#888'}}>{r.media_atraso||'-'} dias</td>
                                        </tr>)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div style={{...cs,marginBottom:14}}>
                        <div style={ts}><BarChart3 size={14} color="#3b82f6"/> Volume de Atendimentos por Assunto <span style={{marginLeft:'auto',fontSize:11,fontWeight:500,color:'#aaa'}}>{d.assuntosVolume?.length} assuntos</span></div>
                        <div style={{maxHeight:400,overflow:'auto'}}>
                            <table className="table" style={{fontSize:11}}>
                                <thead><tr><th>Assunto</th><th style={{textAlign:'center'}}>Total</th><th style={{textAlign:'center'}}>Realizados</th><th style={{textAlign:'center'}}>Em Aberto</th><th>Distribuição</th></tr></thead>
                                <tbody>
                                    {d.assuntosVolume?.map((r,i) => {
                                        const max = d.assuntosVolume[0]?.total || 1
                                        const pctBar = Math.round(r.total/max*100)
                                        return <tr key={i}>
                                            <td title={r.assunto} style={{maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.assunto}</td>
                                            <td style={{textAlign:'center',fontWeight:600}}>{fmt(r.total)}</td>
                                            <td style={{textAlign:'center',color:'#22c55e'}}>{fmt(r.realizados)}</td>
                                            <td style={{textAlign:'center',color:'#f59e0b'}}>{fmt(r.abertos)}</td>
                                            <td style={{width:120}}>
                                                <div style={{height:8,borderRadius:4,background:'#f0f0f0',overflow:'hidden'}}>
                                                    <div style={{height:'100%',width:pctBar+'%',borderRadius:4,background:'linear-gradient(90deg,#6B2A8C,#a855f7)'}}/>
                                                </div>
                                            </td>
                                        </tr>
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Assunto x Faixa Etária */}
                    <div style={{...cs,marginBottom:14}}>
                        <div style={ts}><Users size={14} color="#ec4899"/> Distribuição Grau de Risco x Faixa Etária</div>
                        <div style={{height:300}}><canvas id="chartAssFaixa"></canvas></div>
                    </div>

                    {/* Previsão por Assunto */}
                    {d.previsaoAssunto?.length > 0 && (
                        <div style={{...cs,marginBottom:14}}>
                            <div style={ts}><TrendingUp size={14} color="#f59e0b"/> Previsão de Demanda por Assunto <span style={{marginLeft:'auto',fontSize:11,fontWeight:500,color:'#aaa'}}>Top 10</span></div>
                            <div style={{maxHeight:400,overflow:'auto'}}>
                                <table className="table" style={{fontSize:11}}>
                                    <thead><tr><th>Assunto</th><th style={{textAlign:'center'}}>Média 3m</th><th style={{textAlign:'center'}}>Tendência</th><th style={{textAlign:'center'}}>Var/mês</th>{d.previsaoAssunto[0]?.previsao?.map((p,i) => <th key={i} style={{textAlign:'center'}}>{fm(p.mes)}</th>)}</tr></thead>
                                    <tbody>
                                        {d.previsaoAssunto.map((r,i) => (
                                            <tr key={i}>
                                                <td title={r.assunto} style={{maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.assunto}</td>
                                                <td style={{textAlign:'center',fontWeight:600}}>{fmt(r.media_ult3)}</td>
                                                <td style={{textAlign:'center'}}><span style={{padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,background:r.tendencia==='crescente'?'#ef444415':r.tendencia==='decrescente'?'#22c55e15':'#f59e0b15',color:r.tendencia==='crescente'?'#ef4444':r.tendencia==='decrescente'?'#22c55e':'#f59e0b'}}>{r.tendencia==='crescente'?'Crescente':r.tendencia==='decrescente'?'Decrescente':'Estável'}</span></td>
                                                <td style={{textAlign:'center',color:r.slope>0?'#ef4444':'#22c55e',fontWeight:600}}>{r.slope>0?'+':''}{r.slope}</td>
                                                {r.previsao.map((p,j) => <td key={j} style={{textAlign:'center',fontWeight:600,color:'#f59e0b'}}>{fmt(p.total)}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                        <div style={cs}>
                            <div style={ts}><Zap size={14} color="#ef4444"/> Detecção de Anomalias <span style={{marginLeft:'auto',fontSize:10,color:'#aaa'}}>Últimos 90 dias</span></div>
                            {d.anomalias?.stats && (
                                <div style={{display:'flex',gap:12,marginBottom:12}}>
                                    {[
                                        {l:'Média diária',v:d.anomalias.stats.media},
                                        {l:'Desvio padrão',v:d.anomalias.stats.desvio},
                                        {l:'Anomalias',v:d.anomalias.stats.total_anomalias},
                                        {l:'Picos',v:d.anomalias.stats.picos},
                                        {l:'Quedas',v:d.anomalias.stats.quedas},
                                    ].map((s,i) => <div key={i} style={{flex:1,padding:'8px 10px',borderRadius:8,background:'#fafafa',textAlign:'center'}}>
                                        <div style={{fontSize:9,color:'#bbb',textTransform:'uppercase',fontWeight:700}}>{s.l}</div>
                                        <div style={{fontSize:16,fontWeight:700,color:'#1a1a2e'}}>{s.v}</div>
                                    </div>)}
                                </div>
                            )}
                            <div style={{height:200}}><canvas id="chartAnomalia"></canvas></div>
                            {d.anomalias?.assunto_anomalias?.length > 0 && (
                                <div style={{marginTop:12}}>
                                    <div style={{fontSize:11,fontWeight:600,color:'#666',marginBottom:6}}>Assuntos com volume anômalo (30 dias)</div>
                                    {d.anomalias.assunto_anomalias.map((a,i) => (
                                        <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #f5f5f5',fontSize:11}}>
                                            <span style={{color:'#555',maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={a.assunto}>{a.assunto}</span>
                                            <span style={{fontWeight:600,color:'#ef4444'}}>{a.total} <span style={{fontSize:9,color:'#aaa'}}>z={a.z_score}</span></span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={cs}>
                            <div style={ts}><TrendingUp size={14} color="#f59e0b"/> Previsão de Demanda <span style={{marginLeft:'auto',fontSize:10,color:'#aaa'}}>Próximos 3 meses</span></div>
                            {d.previsao && (
                                <div style={{display:'flex',gap:12,marginBottom:12}}>
                                    {[
                                        {l:'Tendência',v:d.previsao.tendencia==='crescente'?'Crescente':d.previsao.tendencia==='decrescente'?'Decrescente':'Estável',c:d.previsao.tendencia==='crescente'?'#ef4444':d.previsao.tendencia==='decrescente'?'#22c55e':'#f59e0b'},
                                        {l:'Média últ. 3 meses',v:fmt(d.previsao.media_ult3||0),c:'#6B2A8C'},
                                        {l:'Variação/mês',v:(d.previsao.slope>0?'+':'')+d.previsao.slope,c:d.previsao.slope>0?'#ef4444':'#22c55e'},
                                    ].map((s,i) => <div key={i} style={{flex:1,padding:'8px 10px',borderRadius:8,background:'#fafafa',textAlign:'center'}}>
                                        <div style={{fontSize:9,color:'#bbb',textTransform:'uppercase',fontWeight:700}}>{s.l}</div>
                                        <div style={{fontSize:15,fontWeight:700,color:s.c}}>{s.v}</div>
                                    </div>)}
                                </div>
                            )}
                            <div style={{height:200}}><canvas id="chartPrevisao"></canvas></div>
                            {d.previsao?.previsao?.length > 0 && (
                                <div style={{marginTop:12}}>
                                    <div style={{fontSize:11,fontWeight:600,color:'#666',marginBottom:6}}>Previsão mensal</div>
                                    {d.previsao.previsao.map((p,i) => (
                                        <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f5f5f5',fontSize:12}}>
                                            <span style={{color:'#555',fontWeight:500}}>{fm(p.mes)}</span>
                                            <span style={{fontWeight:700,color:'#f59e0b'}}>{fmt(p.total)} atendimentos</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </Section>}

                {/* ═══════ NPS ═══════ */}
                {secao === 'nps' && (() => {
                    const nps = d.nps
                    if (!nps || !nps.kpis || !nps.kpis.total) {
                        return <Section title="NPS — Net Promoter Score">
                            <div style={{...cs,textAlign:'center',padding:'60px 20px',color:'#bbb'}}>
                                <Smile size={48} color="#ddd" style={{marginBottom:16}}/>
                                <p style={{fontSize:13,color:'#888'}}>Sem dados de NPS para o filtro selecionado.</p>
                            </div>
                        </Section>
                    }
                    const k = nps.kpis
                    const total = Math.max(k.total, 1)
                    const pctProm = Math.round(k.promotores / total * 1000) / 10
                    const pctNeu  = Math.round(k.neutros    / total * 1000) / 10
                    const pctDet  = Math.round(k.detratores / total * 1000) / 10
                    const scoreNum = Number(k.score) || 0
                    const scoreColor = scoreNum >= 75 ? '#16a34a'
                                       : scoreNum >= 50 ? '#22c55e'
                                       : scoreNum >= 0 ? '#f59e0b' : '#ef4444'
                    const zonaLabel = scoreNum >= 75 ? 'Zona de Excelência'
                                    : scoreNum >= 50 ? 'Zona de Qualidade'
                                    : scoreNum >= 0  ? 'Zona de Aperfeiçoamento'
                                    :                  'Zona Crítica'
                    const maxNota = Math.max(...nps.distribuicao.map(x => x.qtd), 1)
                    const corNota = (n) => n >= 9 ? '#16a34a' : n >= 7 ? '#f59e0b' : '#ef4444'

                    // Variação vs mês anterior
                    const evol = nps.evolucao_mensal || []
                    const lastIdx = evol.length - 1
                    const ultMes  = lastIdx >= 0 ? evol[lastIdx] : null
                    const penultMes = lastIdx >= 1 ? evol[lastIdx - 1] : null
                    const deltaScore = (ultMes && penultMes)
                        ? Math.round((Number(ultMes.score) - Number(penultMes.score)) * 10) / 10
                        : null

                    // Gauge: arc semicircular -100 → 100, ponteiro no scoreNum
                    // Mapeia scoreNum (-100..100) para ângulo (-90..90 graus)
                    const angle = Math.max(-90, Math.min(90, scoreNum * 0.9))
                    const rad = (angle - 90) * Math.PI / 180
                    const cx = 150, cy = 150, r = 110
                    const ptrX = cx + r * Math.cos(rad)
                    const ptrY = cy + r * Math.sin(rad)

                    // Benchmark de mercado (NPS médio de saúde corporativa ≈ 40 segundo Bain/SatMetrix)
                    const benchmark = 40
                    const vsBenchmark = Math.round((scoreNum - benchmark) * 10) / 10

                    // Período legível
                    const fmtMes = (s) => fm(s)
                    const periodoLabel = (evol.length > 0)
                        ? `${fmtMes(evol[0].mes)} — ${fmtMes(evol[evol.length-1].mes)}`
                        : 'Sem dados'

                    return <Section title="NPS — Net Promoter Score">
                        {/* ===== HERO EXECUTIVO ===== */}
                        <div style={{...cs, padding:'32px 36px', marginBottom:16, position:'relative', overflow:'hidden'}}>
                            {/* faixa lateral colorida */}
                            <div style={{position:'absolute',left:0,top:0,bottom:0,width:5,background:`linear-gradient(180deg, ${scoreColor}, ${scoreColor}80)`}}/>

                            <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:32,alignItems:'center'}}>
                                <div>
                                    <div style={{fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'2.5px',marginBottom:14}}>
                                        Net Promoter Score · {periodoLabel}
                                    </div>
                                    <div style={{display:'flex',alignItems:'flex-end',gap:18}}>
                                        <div style={{fontSize:128,fontWeight:900,color:scoreColor,lineHeight:0.85,letterSpacing:'-5px'}}>
                                            {k.score ?? '-'}
                                        </div>
                                        <div style={{paddingBottom:14}}>
                                            <div style={{
                                                fontSize:13,fontWeight:700,color:'#fff',
                                                padding:'4px 12px',borderRadius:6,
                                                background:scoreColor,display:'inline-block',
                                                letterSpacing:'0.5px'
                                            }}>{zonaLabel.toUpperCase()}</div>
                                            {deltaScore !== null && (
                                                <div style={{fontSize:13,color:deltaScore >= 0 ? '#16a34a' : '#dc2626',fontWeight:600,marginTop:8,display:'flex',alignItems:'center',gap:5}}>
                                                    {deltaScore >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}
                                                    {deltaScore >= 0 ? '+' : ''}{deltaScore} pts vs. mês anterior
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{fontSize:14,color:'#666',marginTop:18,lineHeight:1.5,maxWidth:520}}>
                                        Baseado em <strong style={{color:'#1a1a2e'}}>{fmt(k.total)}</strong> avaliações de beneficiários,
                                        com nota média de <strong style={{color:'#1a1a2e'}}>{k.nota_media}/10</strong>.
                                    </div>
                                </div>

                                {/* Benchmark + comparação */}
                                <div style={{
                                    background:'#fafaf9',
                                    border:'1px solid #efeae6',
                                    borderRadius:12,
                                    padding:'20px 22px'
                                }}>
                                    <div style={{fontSize:10,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:12}}>
                                        Comparativo de Mercado
                                    </div>
                                    <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:6}}>
                                        <span style={{fontSize:13,color:'#666'}}>Saúde Corporativa</span>
                                        <span style={{fontSize:18,fontWeight:700,color:'#444'}}>{benchmark}</span>
                                    </div>
                                    <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14}}>
                                        <span style={{fontSize:13,color:'#1a1a2e',fontWeight:600}}>Boon Saúde</span>
                                        <span style={{fontSize:22,fontWeight:800,color:scoreColor}}>{k.score}</span>
                                    </div>
                                    <div style={{height:1,background:'#efeae6',margin:'8px 0 14px'}}/>
                                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                                        {vsBenchmark >= 0
                                            ? <TrendingUp size={20} color="#16a34a"/>
                                            : <TrendingDown size={20} color="#dc2626"/>}
                                        <div>
                                            <div style={{fontSize:18,fontWeight:800,color:vsBenchmark >= 0 ? '#16a34a' : '#dc2626',lineHeight:1}}>
                                                {vsBenchmark >= 0 ? '+' : ''}{vsBenchmark} pts
                                            </div>
                                            <div style={{fontSize:11,color:'#888',marginTop:2}}>
                                                {vsBenchmark >= 0 ? 'acima' : 'abaixo'} da média do setor
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ===== TRINCA EXECUTIVA ===== */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
                            {[
                                { label:'Promotores', sub:'Notas 9 e 10',  qtd:k.promotores, pct:pctProm, color:'#16a34a', accent:'#86efac' },
                                { label:'Neutros',    sub:'Notas 7 e 8',   qtd:k.neutros,    pct:pctNeu,  color:'#d97706', accent:'#fcd34d' },
                                { label:'Detratores', sub:'Notas 0 a 6',   qtd:k.detratores, pct:pctDet,  color:'#dc2626', accent:'#fca5a5' },
                            ].map(it => (
                                <div key={it.label} style={{
                                    ...cs,
                                    padding:'22px 24px',
                                    borderTop:`4px solid ${it.color}`,
                                    position:'relative',
                                    overflow:'hidden'
                                }}>
                                    <div style={{position:'absolute',right:-20,top:-20,width:90,height:90,borderRadius:'50%',background:`${it.color}08`}}/>
                                    <div style={{position:'relative',zIndex:1}}>
                                        <div style={{fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:4}}>{it.label}</div>
                                        <div style={{fontSize:11,color:'#bbb',marginBottom:12}}>{it.sub}</div>
                                        <div style={{display:'flex',alignItems:'baseline',gap:10}}>
                                            <span style={{fontSize:46,fontWeight:900,color:it.color,lineHeight:1,letterSpacing:'-1.5px'}}>{it.pct.toFixed(1)}<span style={{fontSize:20}}>%</span></span>
                                            <span style={{fontSize:13,color:'#aaa',fontWeight:600}}>· {fmt(it.qtd)} pessoas</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{display:'grid',gridTemplateColumns:'1fr 1.3fr',gap:14,marginBottom:16}}>
                            {/* Distribuição das notas */}
                            <div style={cs}>
                                <div style={ts}><BarChart3 size={14} color="#6B2A8C"/> Distribuição das notas</div>
                                {(() => {
                                    const BARS_H = 200 // altura útil da área de barras em px
                                    return (
                                        <div style={{display:'flex',alignItems:'flex-end',gap:6,padding:'18px 4px 4px'}}>
                                            {nps.distribuicao.map(r => {
                                                const h = Math.max(4, Math.round((r.qtd / maxNota) * BARS_H))
                                                return (
                                                    <div key={r.nota} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
                                                        <div style={{fontSize:10,fontWeight:700,color:'#666',marginBottom:4}}>{r.qtd}</div>
                                                        <div style={{
                                                            width:'100%',
                                                            height: h,
                                                            background: `linear-gradient(180deg, ${corNota(r.nota)}, ${corNota(r.nota)}cc)`,
                                                            borderRadius:'6px 6px 0 0',
                                                            boxShadow:`0 -2px 8px ${corNota(r.nota)}40`,
                                                            transition:'height 0.4s'
                                                        }}/>
                                                        <div style={{fontSize:12,fontWeight:700,color:'#444',marginTop:6}}>{r.nota}</div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )
                                })()}
                                <div style={{display:'flex',gap:6,marginTop:8}}>
                                    <div style={{flex:7,height:3,background:'#dc2626',borderRadius:2,opacity:0.7}}/>
                                    <div style={{flex:2,height:3,background:'#d97706',borderRadius:2,opacity:0.7}}/>
                                    <div style={{flex:2,height:3,background:'#16a34a',borderRadius:2,opacity:0.7}}/>
                                </div>
                                <div style={{display:'flex',gap:6,marginTop:4,fontSize:9,fontWeight:700,color:'#aaa',letterSpacing:'1px',textTransform:'uppercase'}}>
                                    <span style={{flex:7}}>Detratores</span>
                                    <span style={{flex:2,textAlign:'center'}}>Neutros</span>
                                    <span style={{flex:2,textAlign:'right'}}>Promotores</span>
                                </div>
                            </div>

                            {/* Evolução mensal — gráfico de linha SVG */}
                            <div style={cs}>
                                <div style={ts}><Activity size={14} color="#16a34a"/> Evolução do NPS por mês</div>
                                {evol.length === 0 ? (
                                    <div style={{padding:24,textAlign:'center',color:'#bbb',fontSize:12}}>Sem dados</div>
                                ) : (() => {
                                    const W = 480, H = 220, pad = { l: 36, r: 16, t: 24, b: 36 }
                                    const xs = evol.length > 1 ? (W - pad.l - pad.r) / (evol.length - 1) : 0
                                    const ys = (H - pad.t - pad.b) / 200 // -100..+100
                                    const xAt = i => pad.l + i * xs
                                    const yAt = s => pad.t + (100 - Number(s)) * ys
                                    const linePath = evol.map((m,i) =>
                                        `${i===0?'M':'L'} ${xAt(i)} ${yAt(m.score)}`).join(' ')
                                    const areaPath = linePath + ` L ${xAt(evol.length - 1)} ${H - pad.b} L ${xAt(0)} ${H - pad.b} Z`
                                    return (
                                        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{marginTop:6}}>
                                            <defs>
                                                <linearGradient id="grad-nps" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%"  stopColor="#16a34a" stopOpacity="0.35"/>
                                                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0"/>
                                                </linearGradient>
                                            </defs>
                                            {/* grid linhas em 0, 50, 100 */}
                                            {[100, 50, 0, -50].map(v => (
                                                <g key={v}>
                                                    <line x1={pad.l} y1={yAt(v)} x2={W-pad.r} y2={yAt(v)} stroke="#f0f0f0"/>
                                                    <text x={pad.l-6} y={yAt(v)+3} fontSize="9" textAnchor="end" fill="#aaa">{v}</text>
                                                </g>
                                            ))}
                                            {/* zona de excelência destaque */}
                                            <line x1={pad.l} y1={yAt(50)} x2={W-pad.r} y2={yAt(50)} stroke="#22c55e" strokeDasharray="3,3" strokeWidth="1" opacity="0.5"/>
                                            {/* área */}
                                            <path d={areaPath} fill="url(#grad-nps)"/>
                                            {/* linha */}
                                            <path d={linePath} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round"/>
                                            {/* pontos */}
                                            {evol.map((m,i) => (
                                                <g key={m.mes}>
                                                    <circle cx={xAt(i)} cy={yAt(m.score)} r={4.5} fill="#fff" stroke="#16a34a" strokeWidth="2.5"/>
                                                    <text x={xAt(i)} y={yAt(m.score) - 12} fontSize="10" fontWeight="700" textAnchor="middle" fill="#16a34a">{m.score}</text>
                                                    <text x={xAt(i)} y={H - pad.b + 14} fontSize="10" textAnchor="middle" fill="#888">{fm(m.mes)}</text>
                                                </g>
                                            ))}
                                        </svg>
                                    )
                                })()}
                            </div>
                        </div>

                        {/* Vozes recentes — só promotores e detratores, sem CPF */}
                        {nps.ultimas_respostas.length > 0 && (
                            <div style={cs}>
                                <div style={ts}><Smile size={14} color="#16a34a"/> Avaliações recentes</div>
                                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:10,marginTop:10}}>
                                    {nps.ultimas_respostas.slice(0, 24).map((r,i) => {
                                        const cor = corNota(r.nota)
                                        return (
                                            <div key={i} style={{
                                                padding:'10px 12px',
                                                borderRadius:10,
                                                background:cor+'10',
                                                border:`1px solid ${cor}25`,
                                                display:'flex',alignItems:'center',gap:10
                                            }}>
                                                <div style={{
                                                    width:36,height:36,borderRadius:50,
                                                    background:cor,color:'#fff',
                                                    display:'flex',alignItems:'center',justifyContent:'center',
                                                    fontSize:15,fontWeight:800,flexShrink:0
                                                }}>{r.nota}</div>
                                                <div style={{minWidth:0,flex:1}}>
                                                    <div style={{fontSize:11,fontWeight:700,color:cor,textTransform:'capitalize'}}>{r.categoria}</div>
                                                    <div style={{fontSize:10,color:'#999'}}>{new Date(r.resposta_time).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </Section>
                })()}

                {/* ═══════ IA ═══════ */}
                {secao === 'ia' && <Section title="Análise com Inteligência Artificial">
                    <div style={{...cs,position:'relative'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                            <div style={ts}><Brain size={14} color="#8b5cf6"/> Insights gerados por IA</div>
                            <button ref={aiBtnRef} onClick={loadAi} className="btn btn-primary btn-sm" style={{fontSize:12}}>
                                Gerar Análise
                            </button>
                        </div>
                        <div ref={aiRef} style={{fontSize:13,lineHeight:1.7,color:'#333'}}>
                            <div style={{textAlign:'center',padding:'40px 20px',color:'#bbb'}}>
                                <Brain size={40} color="#ddd" style={{marginBottom:12}}/>
                                <p style={{fontSize:13}}>Clique em "Gerar Análise" para que a IA analise os dados e gere insights acionáveis.</p>
                            </div>
                        </div>
                    </div>
                </Section>}
            </div>

            {/* ═══════ MODAL DETALHE ═══════ */}
            <div ref={modalRef} data-modal style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'none',alignItems:'center',justifyContent:'center'}} onClick={closeModal}>
                <div ref={modalBodyRef} style={{background:'#fff',borderRadius:16,width:'90%',maxWidth:900,maxHeight:'80vh',display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
                </div>
            </div>
        </div>
    )
}
