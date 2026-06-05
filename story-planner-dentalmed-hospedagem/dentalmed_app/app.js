const data = [
  {date:'08/06', day:'Segunda-feira', shifts:{'Manhã':['Abertura da loja e equipe chegando para mais uma semana.','Mostrar algum setor sendo organizado para receber os clientes.','Close em um produto premium ou lançamento disponível na unidade.'],'Tarde':['Quadro: Dica do Acadêmico — apresentar um material bastante utilizado na graduação.','Explicar rapidamente para que ele serve ou em qual disciplina costuma ser utilizado.','Enquete: Você já usou esse material?']}},
  {date:'09/06', day:'Terça-feira', shifts:{'Manhã':['Mostrar uma marca parceira para dar visibilidade.','Destaque para uma linha de produtos.','Vídeo aproximando a câmera do produto, valorizando os detalhes.'],'Tarde':['Quadro: Favorito da Bancada — produto muito procurado pelos dentistas.','Mostrar alguém apresentando rapidamente o produto.','CTA leve: Passe na loja para conhecer.']}},
  {date:'10/06', day:'Quarta-feira', shifts:{'Manhã':['Bastidores da equipe iniciando o expediente.','Mostrar algum colaborador organizando produtos ou conferindo pedidos.','Registrar um momento espontâneo entre a equipe.'],'Tarde':['Mostrar uma marca ou produto recém-chegado na loja.','Destacar um diferencial desse produto.','Caixa de perguntas: Qual produto você gostaria de ver por aqui?']}},
  {date:'11/06', day:'Quinta-feira', shifts:{'Manhã':['Mostrar a movimentação natural da loja.','Apresentar um cantinho ou exposição de produtos em destaque.','Mostrar um cliente sendo atendido, caso autorizado.'],'Tarde':['Curiosidade rápida sobre um instrumental ou equipamento odontológico.','Mostrar o produto em detalhes.','Enquete: Você já conhecia essa função?']}},
  {date:'12/06', day:'Sexta-feira', shifts:{'Manhã':['Mostrar a loja em clima de São João.','Registrar detalhes da decoração junina.','Equipe interagindo de forma espontânea.'],'Tarde':['Produto destaque da semana.','Bastidores do atendimento da tarde.','Desejar um excelente final de semana para os clientes.']}},
  {date:'13/06', day:'Sábado', shifts:{'Manhã':['Loja aberta e pronta para receber os clientes.','Mostrar o movimento do sábado.','Destacar algum produto ou promoção disponível na unidade.']}}
];
const state = JSON.parse(localStorage.getItem('dentalmedPlanner') || '{}');
const calendar = document.getElementById('calendar');
const statusFilter = document.getElementById('statusFilter');
const shiftFilter = document.getElementById('shiftFilter');
function key(d,s,i){return `${d}-${s}-${i}`}
function save(){localStorage.setItem('dentalmedPlanner', JSON.stringify(state))}
function render(){
  calendar.innerHTML=''; let total=0, done=0;
  data.forEach(day=>{
    const card=document.createElement('article'); card.className='day-card';
    let dayTotal=0, dayDone=0, content='';
    Object.entries(day.shifts).forEach(([shift,tasks])=>{
      if(shiftFilter.value!=='all' && shiftFilter.value!==shift) return;
      let tasksHtml='';
      tasks.forEach((task,i)=>{
        const id=key(day.date,shift,i); const item=state[id]||{}; const isDone=!!item.done;
        if(statusFilter.value==='done' && !isDone) return;
        if(statusFilter.value==='pending' && isDone) return;
        total++; dayTotal++; if(isDone){done++; dayDone++;}
        tasksHtml += `<div class="task ${isDone?'done':''}"><input type="checkbox" ${isDone?'checked':''} data-id="${id}"><div><div class="task-title">${task}</div><div class="task-desc">${day.date} • ${day.day} • ${shift}</div></div><textarea class="note" data-note="${id}" placeholder="Adicionar observação...">${item.note||''}</textarea></div>`;
      });
      if(tasksHtml) content += `<div class="shift"><h3>${shift}</h3>${tasksHtml}</div>`;
    });
    if(!content) return;
    const percent = dayTotal ? Math.round((dayDone/dayTotal)*100) : 0;
    card.innerHTML=`<div class="day-head"><h2>${day.date} • ${day.day}</h2><p>${dayDone}/${dayTotal} tarefas concluídas</p><div class="progress"><span style="width:${percent}%"></span></div></div>${content}`;
    calendar.appendChild(card);
  });
  document.getElementById('totalTasks').textContent=total;
  document.getElementById('doneTasks').textContent=done;
  document.getElementById('pendingTasks').textContent=total-done;
  document.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.onchange=e=>{state[e.target.dataset.id]={...(state[e.target.dataset.id]||{}),done:e.target.checked};save();render();});
  document.querySelectorAll('.note').forEach(n=>n.oninput=e=>{state[e.target.dataset.note]={...(state[e.target.dataset.note]||{}),note:e.target.value};save();});
}
statusFilter.onchange=render; shiftFilter.onchange=render; render();
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
