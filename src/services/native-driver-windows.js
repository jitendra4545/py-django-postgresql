import {env} from '../config/env.js';
const stamp=(day,time)=>{
 if(!day)return null;
 const date=day instanceof Date?day.toISOString().slice(0,10):String(day).slice(0,10);
 const value=Date.parse(`${date}T${String(time??'00:00:00').slice(0,8)}Z`);
 return Number.isFinite(value)?value:null;
};
const sql=value=>new Date(value).toISOString().slice(0,19).replace('T',' ');
export function nativeDriverWindow(row,role){
 const pickup=stamp(row.detail_pick_up_date??row.pick_up_date,row.detail_pick_up_time??row.pick_up_time);
 const dropoff=stamp(row.detail_drop_off_date??row.drop_off_date,row.detail_drop_off_time??row.drop_off_time);
 const task=env.DRIVER_BOOKING_TASK_MINUTES*60000;
 let start=pickup,end;
 if(Number(row.service_type)===2){start=role==='DROPOFF'?(dropoff??pickup):pickup;end=start==null?null:start+task;}
 else if([3,4].includes(Number(row.service_type)))end=start==null?null:start+task;
 else end=dropoff!=null&&pickup!=null&&dropoff>pickup&&dropoff-pickup<=env.DRIVER_BOOKING_MAX_JOB_MINUTES*60000?dropoff:start==null?null:start+task;
 return start==null||end==null?null:{start:sql(start),end:sql(end)};
}
export function bufferedDriverWindow(start,end){
 const buffer=env.DRIVER_BOOKING_BUFFER_MINUTES*60000;
 return {start:sql(Date.parse(start)-buffer),end:sql(Date.parse(end)+buffer)};
}
