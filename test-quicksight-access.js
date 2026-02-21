/**
 * Test script to access QuickSight flow URL via amzn-mcp
 */

const mcpClient = require('./services/mcp-client');

async function testQuickSightAccess() {
    console.log('\n=== QuickSight Access Test ===\n');

    const quicksightUrl = 'https://us-east-1.quicksight.aws.amazon.com/sn/account/amazonbi/flows/view/49adc789-bb5f-4c54-b9ed-30ad9536ec2a';

    try {
        console.log(`Testing URL: ${quicksightUrl}\n`);
        console.log('Connecting to amzn-mcp...');

        // Call the read_internal_website tool
        const result = await mcpClient.callTool('amzn-mcp', 'read_internal_website', {
            url: quicksightUrl
        });

        console.log('\n✅ Successfully retrieved data from QuickSight!\n');

        // Display the result structure
        console.log('Result structure:');
        console.log('- Type:', typeof result);
        console.log('- Keys:', Object.keys(result));
        console.log('\n--- Full Result ---\n');
        
        // Pretty print the result
        if (result.content && Array.isArray(result.content)) {
            console.log('Content array with', result.content.length, 'item(s)');
            result.content.forEach((item, index) => {
                console.log(`\n[Item ${index + 1}]`);
                console.log('Type:', item.type);
                if (item.text) {
                    console.log('Text length:', item.text.length, 'characters');
                    console.log('\n--- First 1000 characters ---');
                    console.log(item.text.substring(0, 1000));
                    console.log('\n--- Last 500 characters ---');
                    console.log(item.text.substring(Math.max(0, item.text.length - 500)));
                }
            });
        } else {
            console.log(JSON.stringify(result, null, 2));
        }

        // Try to detect if it's JSON
        console.log('\n\n=== Data Format Analysis ===\n');
        
        if (result.content && result.content[0] && result.content[0].text) {
            const text = result.content[0].text;
            
            // Check if it looks like JSON
            if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                console.log('✅ Response appears to be JSON!');
                try {
                    const jsonData = JSON.parse(text);
                    console.log('\nParsed JSON structure:');
                    console.log('- Type:', Array.isArray(jsonData) ? 'Array' : 'Object');
                    console.log('- Keys:', Object.keys(jsonData).slice(0, 10));
                    console.log('\nSample data:');
                    console.log(JSON.stringify(jsonData, null, 2).substring(0, 500));
                } catch (e) {
                    console.log('⚠️  Could not parse as JSON:', e.message);
                }
            } else if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
                console.log('⚠️  Response appears to be HTML, not JSON');
                console.log('This might require authentication or the URL format may need adjustment');
            } else {
                console.log('❓ Response format unclear. Content preview:');
                console.log(text.substring(0, 200));
            }
        }

    } catch (error) {
        console.error('\n❌ Error accessing QuickSight:', error.message);
        console.error('\nPossible reasons:');
        console.error('  1. Authentication required');
        console.error('  2. URL not accessible via read_internal_website');
        console.error('  3. Network/permission issue');
        console.error('\nFull error:', error);
    } finally {
        // Clean up
        await mcpClient.closeAll();
        process.exit(0);
    }
}

// Run the test
testQuickSightAccess();