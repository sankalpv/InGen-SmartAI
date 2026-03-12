#!/usr/bin/env node

/**
 * Test script to verify available Ollama models for leadership features
 * Tests both LLM and embedding models
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

const MODELS_TO_TEST = {
  llm: [
    'qwen3:8b',
    'qwen2.5:8b',
    'llama3',
    'llama3:8b'
  ],
  embedding: [
    'qwen3-embedding',
    'qwen2.5-embedding',
    'mxbai-embed-large',
    'nomic-embed-text',
    'snowflake-arctic-embed',
    'all-minilm'
  ]
};

async function testLLM(model) {
  try {
    console.log(`Testing LLM: ${model}...`);
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: 'Test prompt for verification',
        stream: false
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`  ✅ ${model}: Available (response length: ${data.response?.length || 0})`);
      return { model, available: true, type: 'llm' };
    } else {
      const error = await response.text();
      console.log(`  ❌ ${model}: ${response.status} - ${error.substring(0, 100)}`);
      return { model, available: false, type: 'llm', error: response.status };
    }
  } catch (error) {
    console.log(`  ❌ ${model}: Error - ${error.message}`);
    return { model, available: false, type: 'llm', error: error.message };
  }
}

async function testEmbedding(model) {
  try {
    console.log(`Testing Embedding: ${model}...`);
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: 'Test embedding for leadership analytics'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const dimensions = data.embedding?.length || 0;
      console.log(`  ✅ ${model}: Available (${dimensions} dimensions)`);
      return { model, available: true, type: 'embedding', dimensions };
    } else {
      const error = await response.text();
      console.log(`  ❌ ${model}: ${response.status} - ${error.substring(0, 100)}`);
      return { model, available: false, type: 'embedding', error: response.status };
    }
  } catch (error) {
    console.log(`  ❌ ${model}: Error - ${error.message}`);
    return { model, available: false, type: 'embedding', error: error.message };
  }
}

async function getInstalledModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      return data.models || [];
    }
  } catch (error) {
    console.log('⚠️  Could not fetch installed models:', error.message);
  }
  return [];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  InGen SmartAI - Model Compatibility Test');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log(`Testing Ollama at: ${OLLAMA_BASE_URL}\n`);
  
  // Check connection
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      console.log('❌ Cannot connect to Ollama. Is it running?');
      console.log('   Start Ollama and try again.\n');
      process.exit(1);
    }
    console.log('✅ Connected to Ollama successfully\n');
  } catch (error) {
    console.log('❌ Cannot connect to Ollama:', error.message);
    console.log('   Start Ollama and try again.\n');
    process.exit(1);
  }
  
  // Show installed models
  console.log('Currently Installed Models:');
  console.log('─────────────────────────────────────────────────────');
  const installed = await getInstalledModels();
  if (installed.length > 0) {
    installed.forEach(m => {
      const size = (m.size / (1024 * 1024 * 1024)).toFixed(2);
      console.log(`  • ${m.name} (${size} GB)`);
    });
  } else {
    console.log('  (No models found)');
  }
  console.log('');
  
  // Test LLMs
  console.log('\n📊 Testing LLM Models:');
  console.log('─────────────────────────────────────────────────────');
  const llmResults = [];
  for (const model of MODELS_TO_TEST.llm) {
    const result = await testLLM(model);
    llmResults.push(result);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
  }
  
  // Test Embeddings
  console.log('\n📊 Testing Embedding Models:');
  console.log('─────────────────────────────────────────────────────');
  const embeddingResults = [];
  for (const model of MODELS_TO_TEST.embedding) {
    const result = await testEmbedding(model);
    embeddingResults.push(result);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
  }
  
  // Recommendations
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const availableLLMs = llmResults.filter(r => r.available);
  const availableEmbeddings = embeddingResults.filter(r => r.available);
  
  console.log('🤖 LLM (for text generation & analysis):');
  if (availableLLMs.length > 0) {
    const qwen = availableLLMs.find(m => m.model.includes('qwen'));
    if (qwen) {
      console.log(`  ✅ RECOMMENDED: ${qwen.model}`);
      console.log('     (32k context, superior reasoning for leadership analytics)');
    } else {
      console.log(`  ✅ Available: ${availableLLMs[0].model}`);
    }
  } else {
    console.log('  ⚠️  No LLM models available. Install one:');
    console.log('     ollama pull qwen3:8b    (Recommended)');
    console.log('     ollama pull llama3      (Alternative)');
  }
  
  console.log('\n📐 Embedding Model (for vector search):');
  if (availableEmbeddings.length > 0) {
    // Prioritize by preference
    const qwenEmbed = availableEmbeddings.find(m => m.model.includes('qwen'));
    const mxbai = availableEmbeddings.find(m => m.model.includes('mxbai'));
    const nomic = availableEmbeddings.find(m => m.model.includes('nomic'));
    
    if (qwenEmbed) {
      console.log(`  ✅ RECOMMENDED: ${qwenEmbed.model} (${qwenEmbed.dimensions}d)`);
      console.log('     (8k context, unified with Qwen LLM)');
    } else if (mxbai) {
      console.log(`  ✅ RECOMMENDED: ${mxbai.model} (${mxbai.dimensions}d)`);
      console.log('     (1024 dimensions, high accuracy)');
    } else if (nomic) {
      console.log(`  ✅ Available: ${nomic.model} (${nomic.dimensions}d)`);
      console.log('     (Current, works well)');
    } else {
      console.log(`  ✅ Available: ${availableEmbeddings[0].model} (${availableEmbeddings[0].dimensions}d)`);
    }
  } else {
    console.log('  ⚠️  No embedding models available. Install one:');
    console.log('     ollama pull mxbai-embed-large  (Recommended)');
    console.log('     ollama pull nomic-embed-text   (Alternative)');
  }
  
  console.log('\n📝 Next Steps:');
  console.log('─────────────────────────────────────────────────────');
  
  if (availableLLMs.length === 0 || availableEmbeddings.length === 0) {
    console.log('  1. Install missing models (see recommendations above)');
    console.log('  2. Re-run this test: node test-embedding-models.js');
    console.log('  3. Update .env.local with chosen models');
  } else {
    console.log('  ✅ Models ready! Update your .env.local:');
    console.log('');
    
    const bestLLM = availableLLMs.find(m => m.model.includes('qwen')) || availableLLMs[0];
    const bestEmbed = availableEmbeddings.find(m => m.model.includes('qwen')) ||
                      availableEmbeddings.find(m => m.model.includes('mxbai')) ||
                      availableEmbeddings[0];
    
    console.log(`     LLM_MODEL=${bestLLM.model}`);
    console.log(`     EMBEDDING_MODEL=${bestEmbed.model}`);
    console.log(`     EMBEDDING_DIMENSIONS=${bestEmbed.dimensions}`);
    console.log('');
    console.log('  Then proceed with leadership feature implementation.');
  }
  
  console.log('\n═══════════════════════════════════════════════════════\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});