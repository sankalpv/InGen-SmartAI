const { fetchOutlookCalendar } = require('../services/outlook-local.js');

async function testDateRanges() {
    console.log('🔍 Testing Calendar Date Range Filtering\n');
    
    try {
        console.log('Testing 7 days...');
        const meetings7 = await fetchOutlookCalendar(null, 7);
        console.log(`✓ 7 days: ${meetings7.length} meetings`);
        
        console.log('\nTesting 14 days...');
        const meetings14 = await fetchOutlookCalendar(null, 14);
        console.log(`✓ 14 days: ${meetings14.length} meetings`);
        
        console.log('\nTesting 30 days...');
        const meetings30 = await fetchOutlookCalendar(null, 30);
        console.log(`✓ 30 days: ${meetings30.length} meetings`);
        
        console.log('\n📊 Results:');
        console.log(`  7 days:  ${meetings7.length} meetings`);
        console.log(`  14 days: ${meetings14.length} meetings`);
        console.log(`  30 days: ${meetings30.length} meetings`);
        
        if (meetings14.length > meetings7.length && meetings30.length > meetings14.length) {
            console.log('\n✅ SUCCESS: Meeting counts increase with date range!');
        } else if (meetings7.length === meetings14.length && meetings14.length === meetings30.length) {
            console.log('\n❌ FAIL: All date ranges return same count - filtering not working');
        } else {
            console.log('\n⚠️  PARTIAL: Some ranges differ but progression is incorrect');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

testDateRanges();