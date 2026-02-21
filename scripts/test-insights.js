const proactiveAgent = require('../services/proactive-agent');
const insightStore = require('../services/insight-store');

async function testInsights() {
    console.log('🔮 Testing AI Insight Generation...\n');
    
    try {
        console.log('Running proactive analysis...');
        const result = await proactiveAgent.runProactiveAnalysis();
        
        console.log('\n✅ Analysis Complete!');
        console.log(`   Generated: ${result.generated} insights`);
        console.log(`   Skipped (duplicates): ${result.skipped} insights\n`);
        
        console.log('📊 Fetching all unread insights...\n');
        const insights = await insightStore.getUnreadInsights();
        
        if (insights.length === 0) {
            console.log('ℹ️  No unread insights found.');
            console.log('   This could mean:');
            console.log('   - No meetings in the next 2 hours');
            console.log('   - No urgent emails in last 24h');
            console.log('   - No relationships with >14 days no contact');
            console.log('   - Similar insights already generated recently\n');
        } else {
            console.log(`Found ${insights.length} unread insights:\n`);
            
            insights.forEach((insight, i) => {
                console.log(`${i + 1}. [${insight.priority.toUpperCase()}] ${insight.type}`);
                console.log(`   ${insight.title}`);
                console.log(`   ${insight.description}`);
                console.log(`   Confidence: ${(insight.confidence * 100).toFixed(0)}%`);
                console.log('');
            });
        }
        
        const stats = await insightStore.getStats();
        console.log('📈 Insight Stats:');
        console.log(`   Total: ${stats.total}`);
        console.log(`   Unread: ${stats.unread}`);
        console.log(`   By Priority:`, stats.byPriority);
        console.log(`   By Type:`, stats.byType);
        
        console.log('\n✨ Check the UI at http://localhost:3000 to see the bell badge!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    
    process.exit(0);
}

testInsights();