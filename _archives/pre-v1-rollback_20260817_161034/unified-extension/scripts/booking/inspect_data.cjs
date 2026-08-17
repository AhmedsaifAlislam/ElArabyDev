const data = require('../public/masterData.json');
console.log('Total records:', data.length);
console.log('Keys:', Object.keys(data[0]));
console.log('First record:');
console.log(JSON.stringify(data[0], null, 2));
console.log('\nSecond record:');
console.log(JSON.stringify(data[1], null, 2));

// Check if defectMajor has values
const withMajor = data.filter(d => d.defectMajor && d.defectMajor.trim() !== '');
console.log('\nRecords with defectMajor:', withMajor.length);
if (withMajor.length > 0) console.log('Sample defectMajor:', withMajor[0].defectMajor);
