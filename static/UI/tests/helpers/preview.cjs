const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function preview(saved) {
  let now = Date.parse('2026-09-27T12:00:00Z');
  class Clock extends Date {
    constructor(...args) {super(...(args.length ? args : [now]));}
    static now() {return now;}
  }
  const storage = new Map(saved ? [['usward-preview-v1', saved]] : []);
  const timeForm = {dataset:{},
    elements: Object.fromEntries(['allDay','start','end','startDate','lastDate'].map(name => [name,{checked:false,addEventListener(){}}])),
    querySelector: () => ({hidden:false})
  };
  const context = vm.createContext({
    Date:Clock, Intl, console, crypto:require('node:crypto').webcrypto,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    document:{body:{dataset:{page:'today'}},hidden:false,addEventListener(){},querySelector:selector=>selector==='#dialog-form'?timeForm:null},
    location:{hash:'',replace(){}},setInterval(){},setTimeout(){},addEventListener(){}
  });
  context.window = context;
  const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname,'../../assets',file),'utf8'),context,{filename:file});
  load('app.js');load('reminders.js');load('notifications.js');load('today.js');load('me.js');load('commitments.js');
  const U = context.U;
  const env = {U,load,advance:ms=>{now+=ms;},saved:()=>{U.save();return storage.get('usward-preview-v1');}};
  U.close = () => {};
  U.toast = (message,error) => {env.toast={message,error};};
  U.modal = (title,html) => {env.modal={title,html};};
  U.render = () => {env.renders=(env.renders||0)+1;U.refreshReminders();};
  U.confirm = (title,copy,label,confirm) => {env.confirm=confirm;};
  U.form = (title,html,submit,options) => {env.form={title,html,submit,options};return timeForm;};
  env.submit = values => {
    const result=env.form.submit(values,timeForm);
    if(typeof result!=='string' && result!==false){U.save();U.render();}
    return result;
  };
  return env;
}
module.exports={preview};
