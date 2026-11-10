import fs from 'node:fs/promises';
const path=new URL('../db/client-schema.json',import.meta.url);
const manifest=JSON.parse(await fs.readFile(path,'utf8'));
for(const table of ['vehicle_original_cities','discount_coupons','reservation_discount_coupons']){
 if(!manifest.target_client_tables.includes(table))manifest.target_client_tables.push(table);
}
manifest.target_client_tables.sort();
Object.assign(manifest.client_tables_newly_reused,{
 vehicle_original_cities:'Native home-city mapping for collection fees; distinct from vehicle service coverage.',
 discount_coupons:'Native coupon configuration, validity, amount/type and usage cap.',
 reservation_discount_coupons:'Native redeemed coupon and reservation discount summary.',
});
manifest.client_tables_outside_mobile_scope=manifest.client_tables_outside_mobile_scope.filter(t=>!manifest.target_client_tables.includes(t));
const lockDDL=`CREATE TABLE IF NOT EXISTS app_vehicle_booking_locks (
 source_kind VARCHAR(8) NOT NULL,
 source_id BIGINT UNSIGNED NOT NULL,
 vehicle_id INT UNSIGNED NOT NULL,
 reservation_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
 reserved_start DATE NOT NULL,
 reserved_end DATE NOT NULL,
 parent_active TINYINT UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (source_kind,source_id),
 KEY idx_mobile_booking_lock_vehicle_window (vehicle_id,parent_active,reserved_start,reserved_end),
 KEY idx_mobile_booking_lock_reservation (reservation_id,vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const lockEntry={table:'app_vehicle_booking_locks',reason:'Derived current/future occupancy claims for atomic cross-application vehicle locking; native tables remain authoritative',proposed_definition:lockDDL};
for(const entries of [manifest.retained_additional_tables,manifest.remaining_if_reported_exactly_true.tables_to_add]){
 const index=entries.findIndex(x=>x.table===lockEntry.table);if(index<0)entries.push(lockEntry);else entries[index]=lockEntry;
}
for(const [table,name,columns] of [
 ['vehicle_reserved_dates','idx_mobile_vehicle_reserved_date',['vehicle_id','reserved_date','reservation_id']],
 ['reservation_vehicles','idx_mobile_reservation_vehicle_window',['vehicle_id','status','pick_up_date','drop_off_date']],
]){
 const ix={table,name,columns,unique:false};
 manifest.proposed_client_indexes[table]??=[];
 if(!manifest.proposed_client_indexes[table].some(x=>x.name===name))manifest.proposed_client_indexes[table].push(ix);
 if(!manifest.remaining_if_reported_exactly_true.new_indexes.some(x=>x.name===name))manifest.remaining_if_reported_exactly_true.new_indexes.push(ix);
}
manifest.date='2026-11-10';
manifest.production_parity_update={native_tables_reused:manifest.target_client_tables.length,new_tables_since_previous_package:1,
 new_columns_since_previous_package:0,new_indexes_since_previous_package:2,new_triggers_since_previous_package:10,
 total_metadata_triggers:4,total_concurrency_triggers:10,legacy_user_model:'App\\User',
 pricing_policy:'Original admin VAT and chauffeur option units; prefer active hourly band 15; configured option amount preserved for both rate_type values as original public and Manage Options code',
 status_policy:'Trip statuses use trip_status, detailed driver events remain separate; chargeable no-show/cancellation never triggers an automatic refund',
 additional_native_tables:['vehicle_original_cities','discount_coupons','reservation_discount_coupons']};
Object.assign(manifest.counts,{target_runtime_client_tables:57,client_tables_outside_mobile_scope:108,
 newly_reused_client_tables:16,
 target_additional_runtime_tables:26,target_additional_tables_total:26,target_total_database_tables_from_clean_dump:191,
 remaining_target_additional_tables_if_reported_exactly_true:24,remaining_new_indexes_if_reported_exactly_true:15,
 physical_schema_tables_if_only_reported_three_exist_and_retired_table_preserved:192,
 total_remaining_indexes_across_existing_client_and_reported_allocator:18});
manifest.historical_proposal_counts??={};
for(const key of ['proposed_client_tables_with_new_columns','proposed_client_new_columns','proposed_client_indexes']){
 if(key in manifest.counts){manifest.historical_proposal_counts[key]=manifest.counts[key];delete manifest.counts[key];}
}
Object.assign(manifest.counts,{physical_added_native_columns_from_clean_schema:71,physical_modified_native_tables:14,
 native_indexes_required_including_reported:26});
Object.assign(manifest.remaining_if_reported_exactly_true,{new_table_count:24,new_index_count:15,logical_active_total_tables:26,
 physical_total_if_only_three_reported_tables_preexist_and_retired_expense_allocator_is_preserved:192});
manifest.implementation.active_additional_base_tables=26;
manifest.implementation.concurrency_triggers=[...['rv','date','block'].flatMap(x=>['insert','update','delete'].map(y=>`dl_mobile_lock_${x}_${y}`)),'dl_mobile_lock_parent_update'];
manifest.implementation.legacy_user_model='App\\User';
manifest.implementation.notes=manifest.implementation.notes.map(x=>x.replace('Canonical trip status rows are inserted only when the normalized slug is absent.','Missing driver_status rows and native trip_status rows are added without changing existing IDs; confirmed/completed use a _trip alias when their slug already belongs to a driver status.'));
manifest.verification='Implemented in release candidate. Disposable MySQL import and test evidence are in docs/PRODUCTION_VERIFICATION.md. Hosted client rows and original Laravel UI remain unverified.';
manifest.assumptions=manifest.assumptions.map(x=>x.replace('The 25 is','The 26 is'));
await fs.writeFile(path,JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(new URL('../db/client-target-tables.sql',import.meta.url),'-- Reference table DDL only. Use npm run db:client:upgrade for the full guarded upgrade.\n\n'+manifest.retained_additional_tables.map(x=>x.proposed_definition.replace(/;?$/,';')).join('\n\n')+'\n');
console.log('Manifest refreshed:',manifest.target_client_tables.length,'native tables, one lock table, two new native indexes, ten concurrency triggers');
