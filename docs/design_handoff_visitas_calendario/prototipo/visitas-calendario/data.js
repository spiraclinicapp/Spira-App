(function(){
const TODAY = '2026-10-08';
const PATIENTS = [
  ['Ricardo Lucio Aguero','032001520003'],['Marisa Quintana','032001520011'],['Ernesto Valdés','032001520007'],
  ['Laura Benítez','032001520014'],['Héctor Domínguez','032001520002'],['Silvia Ferreyra','032001520019'],
  ['Juan Pablo Ríos','032001520021'],['Norma Castillo','032001520009'],['Oscar Medina','032001520016'],
  ['Graciela Paz','032001520005'],['Ramiro Toledo','032001520024'],['Inés Galarza','032001520012'],
  ['Mario Sosa','032001520027'],['Patricia Luna','032001520018']
];
const PROTOS = ['LTS17231','EFC16750','MK3475-B','BO42843'];
const MEDS = ['Dra. Gabriela Scarano','Dr. Martín Iturre','Dra. Paula Rinaldi'];
const COORDS = [null,'Carla Giménez','Lucía Ferrari'];
let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const iso = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const visits = [];
const start = new Date(2026, 8, 21), end = new Date(2026, 10, 15);
let id = 0;
for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
  const date = iso(d), dow = d.getDay();
  if (date === TODAY) continue;
  let n = dow === 0 ? 0 : dow === 6 ? (rnd() < .3 ? 1 : 0) : Math.floor(rnd()*6);
  for (let i = 0; i < n; i++) {
    const p = PATIENTS[Math.floor(rnd()*PATIENTS.length)];
    const v = 1 + Math.floor(rnd()*9);
    const past = date < TODAY;
    visits.push({
      id: 'v'+(id++), date, name: p[0], code: p[1],
      proto: PROTOS[Math.floor(rnd()*PROTOS.length)], tag: 'V'+v+' W'+(v*2), week: 'W'+(v*2),
      med: MEDS[Math.floor(rnd()*MEDS.length)], coord: COORDS[Math.floor(rnd()*COORDS.length)],
      stage: past ? (rnd() < .12 ? 'no_vino' : 'fin') : 'por_llegar',
      procs: 1 + Math.floor(rnd()*4), blood: rnd() < .5, kit: rnd() < .4
    });
  }
}
const mk = (o) => visits.push(Object.assign({ id: 'v'+(id++), date: TODAY, procs: 2, blood: false, kit: false }, o));
mk({ name:'Laura Benítez', code:'032001520014', proto:'EFC16750', tag:'V5 W10', week:'W10', med:'Dr. Martín Iturre', coord:'Carla Giménez', stage:'inicio', procs:3, blood:true, arrived:'08:42' });
mk({ name:'Héctor Domínguez', code:'032001520002', proto:'MK3475-B', tag:'V3 W6', week:'W6', med:'Dra. Paula Rinaldi', coord:'Lucía Ferrari', stage:'concurrio', procs:1, kit:true, arrived:'09:15' });
mk({ name:'Ricardo Lucio Aguero', code:'032001520003', proto:'LTS17231', tag:'V2 W4', week:'W4', med:'Dra. Gabriela Scarano', coord:null, stage:'por_llegar', procs:2, kit:true });
mk({ name:'Ernesto Valdés', code:'032001520007', proto:'BO42843', tag:'V7 W14', week:'W14', med:'Dra. Gabriela Scarano', coord:'Carla Giménez', stage:'fin', procs:2, blood:true, arrived:'07:58' });
const STAGES = {
  inicio:     { label:'En atención', color:'#2E7D74', pct:70, cta:'Fin de atención', group:'centro' },
  concurrio:  { label:'Concurrió',   color:'#2E7D74', pct:40, cta:'Iniciar atención', group:'centro' },
  por_llegar: { label:'Por llegar',  color:'#7C8C87', pct:14, cta:'Marcar llegada', group:'llegar' },
  fin:        { label:'Realizada',   color:'#5C8A5A', pct:100, cta:null, group:'fin' },
  no_vino:    { label:'No vino',     color:'#A6483B', pct:0, cta:null, group:'fin' }
};
window.VC_DATA = { TODAY, visits, STAGES, PROTOS, MEDS };
})();
