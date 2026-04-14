import moment from 'moment';

const chartDate = "2026-04-13";
const trainStartDate = "2026-04-14";

const diff = moment(chartDate).diff(trainStartDate, 'days');
console.log(`Diff: ${diff}`);

const m = moment(`${trainStartDate} 21:37`, "YYYY-MM-DD HH:mm").add(diff, 'days');
console.log(`Formatted: ${m.format("ddd, MMM DD [at] h:mm A")}`);
