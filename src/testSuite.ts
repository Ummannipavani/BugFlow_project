/**
 * Comprehensive System Test Suite for BugFlow Defect Tracking REST Engine
 * Tests:
 * 1. Health & PostgreSQL Connection Diagnostics
 * 2. Authentication & JWT-Based RBAC Enforcement
 * 3. Issue Creation & Strict Payload Validation (Enums, Status, Priority)
 * 4. Defect Lifecycle State Transitions Matrix
 * 5. Real PostgreSQL Analytics Calculation
 * 6. AI Resolution Assistance, Defect Summarization & Historical Retrieval
 */

async function runTestSuite() {
  console.log('🧪 Starting BugFlow Automated Verification Suite...\n');
  const BASE_URL = 'http://localhost:3000';
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  try {
    // 1. Health Check
    console.log('🔹 1. Testing Service & DB Health...');
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'API Health Endpoint returns 200 OK');
    assert(healthData.tables && healthData.tables.includes('issues'), 'Database schema contains issues table');

    // 2. Semantic Search & Vector Similarity
    console.log('\n🔹 2. Testing Semantic Vector Search & Similarity Endpoint...');
    const semanticRes = await fetch(`${BASE_URL}/api/ai/semantic-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'payment submit crash' })
    });
    const semanticData = await semanticRes.json();
    assert(semanticRes.status === 200, 'Semantic search endpoint returns 200 OK');
    assert(Array.isArray(semanticData.results), 'Semantic search returns ranked result array');
    assert(semanticData.results.length > 0 && typeof semanticData.results[0].similarity_score === 'number', 'Semantic search returns valid cosine similarity scores');

    // 3. Analytics Endpoint
    console.log('\n🔹 3. Testing Real PostgreSQL Analytics Endpoint...');
    const analyticsRes = await fetch(`${BASE_URL}/api/analytics`);
    const analyticsData = await analyticsRes.json();
    assert(analyticsRes.status === 200, 'Analytics endpoint returns 200 OK');
    assert(typeof analyticsData.totalDefects === 'number', 'Analytics contains totalDefects aggregation');
    assert(Array.isArray(analyticsData.developerWorkload), 'Analytics computes developer workload breakdown');
    assert(Array.isArray(analyticsData.defectTrends), 'Analytics computes defect discovery trends');

    // Authenticate using real PostgreSQL users. The API no longer trusts spoofable identity headers.
    const login = async (email: string, role: string) => {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'BugFlow2026!', role })
      });
      const data = await response.json();
      assert(response.status === 200 && typeof data.token === 'string', `Authenticated ${role} test user`);
      return data.token as string;
    };

    const developerToken = await login('dev@bugflow.io', 'Developer');
    const qaToken = await login('qa@bugflow.io', 'User / QA');

    // 4. Issue Creation with Valid Payload
    console.log('\n🔹 4. Testing Issue Creation & Validation...');
    const testIssuePayload = {
      title: 'Automated Suite Test Defect',
      description: 'Verifying defect lifecycle pipeline with real PostgreSQL persistence.',
      priority: 'High',
      severity: 'Critical',
      environment: 'Staging Integration Cluster',
      issueType: 'Bug',
      category: 'Backend/API',
      projectName: 'BugFlow Core',
      projectId: 1,
      assigneeName: 'Alex Rivera',
      assigneeRole: 'Developer'
    };

    const createRes = await fetch(`${BASE_URL}/api/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${developerToken}`
      },
      body: JSON.stringify(testIssuePayload)
    });
    const createdIssue = await createRes.json();
    assert(createRes.status === 201 && createdIssue.key && createdIssue.key.startsWith('BF-'), 'Created valid issue with BF-* key');
    assert(createdIssue.status === 'Reported', 'New issue initiates in Reported status');

    // 5. Issue Validation Failure on Invalid Severity
    const invalidSeverityRes = await fetch(`${BASE_URL}/api/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${developerToken}`
      },
      body: JSON.stringify({ ...testIssuePayload, severity: 'InvalidSeverityLevel' })
    });
    assert(invalidSeverityRes.status === 400, 'Rejects invalid severity enum with HTTP 400');

    // 6. Defect Lifecycle State Transitions
    console.log('\n🔹 5. Testing Defect Lifecycle State Transitions & RBAC...');
    if (createdIssue && createdIssue.id) {
      // Transition Reported -> In Progress
      const transitionRes = await fetch(`${BASE_URL}/api/issues/${createdIssue.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${developerToken}`
        },
        body: JSON.stringify({ status: 'In Progress' })
      });
      const transitionedIssue = await transitionRes.json();
      assert(transitionRes.status === 200 && transitionedIssue.status === 'In Progress', 'Allowed valid transition: Reported -> In Progress');

      // Invalid transition: In Progress -> Closed (Bypassing In Review & Resolved)
      const invalidTransitionRes = await fetch(`${BASE_URL}/api/issues/${createdIssue.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${developerToken}`
        },
        body: JSON.stringify({ status: 'Closed' })
      });
      assert(invalidTransitionRes.status === 400, 'Enforced strict state machine: rejects In Progress -> Closed directly');

      // QA Role restriction: QA cannot directly mark In Review or Resolved
      const qaRestrictedRes = await fetch(`${BASE_URL}/api/issues/${createdIssue.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${qaToken}`
        },
        body: JSON.stringify({ status: 'Resolved' })
      });
      assert(qaRestrictedRes.status === 403, 'RBAC enforced: QA role cannot directly mark issues as Resolved');
    }

    // 7. AI Intelligence Workflows
    console.log('\n🔹 6. Testing AI Defect Intelligence & Historical Retrieval...');
    const summaryRes = await fetch(`${BASE_URL}/api/ai/summarize-defect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Database connection timeout during peak sprint export',
        description: 'Under heavy concurrent requests, the pool exceeds max capacity resulting in 504 Gateway Timeout.'
      })
    });
    const summaryData = await summaryRes.json();
    assert(summaryRes.status === 200 && typeof summaryData.summary === 'string', 'AI Defect Summarization returns concise summary');

    const historicalRes = await fetch(`${BASE_URL}/api/ai/historical-resolutions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Connection timeout pool exception',
        description: 'Database connection exhausted during report generation.',
        category: 'Database'
      })
    });
    const historicalData = await historicalRes.json();
    assert(historicalRes.status === 200 && Array.isArray(historicalData.historical_resolutions), 'Historical Resolution Retrieval queries archive');

    const aidRes = await fetch(`${BASE_URL}/api/ai/resolution-assistance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'PostgreSQL connection failure on startup',
        category: 'Database'
      })
    });
    const aidData = await aidRes.json();
    assert(aidRes.status === 200 && Array.isArray(aidData.investigation_areas), 'Resolution Assistant generates investigation checklist');

    console.log(`\n========================================`);
    console.log(`🎉 TEST RUN COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error('Test execution error:', err);
  }
}

runTestSuite();
