import {getDb} from './src/lib/db';
getDb().prepare(`UPDATE additional_services SET available_in_widget = 1 WHERE id IN ('svc_breakfast','svc_sauna','svc_tub','svc_bbq')`).run();
console.log('Done: enabled 4 services for widget');
