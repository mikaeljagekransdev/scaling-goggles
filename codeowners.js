#!/usr/bin/env node

const { on } = require('events');
const fs = require('fs');

const CODEOWNER_POSTFIX = '-codeowners';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const ORG = 'jagekransdev';
const PROJECT = 'SHB-test';
const REPO_ID = 'f9205fad-6169-452a-b070-09ef239c891b';
const DEFAULT_BRANCH = 'main';

const codeownersFile = './CODEOWNERS.json';
const identityNameIdCache = {};

run();

async function run() {
  const rawCodeowners = JSON.parse(fs.readFileSync(codeownersFile));
  const codeowners = await formatCodeowners(rawCodeowners);
  const policies = await getRepoPolicies(REPO_ID);
  const codeownerPaths = Object.keys(codeowners);

  const createAndUpdatePolicyOps = codeownerPaths.map(path => {
    const ownerIds = codeowners[path];
    const policy = policies.find(p => p.settings.filenamePatterns?.includes(path));

    if (policy == null) {
      console.log(`Creating required reviewer policy for path ${path}`);

      return createRequiredReviewerPolicy(
        path,
        ownerIds,
        REPO_ID,
        DEFAULT_BRANCH,
      );
    }

    const existingReviewers = new Set(policy.settings.requiredReviewerIds);
    const dedupedOwnerIds = dedup(ownerIds);
    const reviewerMismatch =
      existingReviewers.size !== dedupedOwnerIds.length
        || dedupedOwnerIds.every(e => !existingReviewers.has(e));

    if (!reviewerMismatch) {
      return;
    }

    console.log(`Updating reviewers for path ${path}`);

    policy.settings.requiredReviewerIds = ownerIds;
    return updateRequiredReviewerPolicy(policy);
  });

  // Remove policies missing from CODEOWNERS.json
  const codeownerPathsSet = new Set(codeownerPaths);
  const extraneousPolicies = policies.filter(p => !codeownerPathsSet.has(p.settings?.filenamePatterns[0]));

  const deletePolicyOps = extraneousPolicies.map(({id}) => deletePolicyConfiguration(id))

  await Promise.all([...createAndUpdatePolicyOps, ...deletePolicyOps]);
}

function dedup(list) {
  return Array.from(new Set(list));
}

async function formatCodeowners(codeowners) {
  const blocks = codeowners.functionalBlocks;

  const pathmap = {};

  for (const f of codeowners.filemap) {
    for (const [path, blockName] of Object.entries(f)) {
      const { owners, additionalApprovers } = blocks[blockName];

      // Create a deduplicated union of teams and users
      const identityNames = Array.from(new Set([...owners, ...additionalApprovers]));

      pathmap[path] = await Promise.all(identityNames.map(getIdentityId));
    }
  }

  return pathmap;
}

function formatTeamName(name) {
  return `${name.replace('@@', '')}${CODEOWNER_POSTFIX}`;
}

async function getIdentityId(name) {
  console.log(`Retrieving identity id for ${name}`);

  if ((cachedId = identityNameIdCache[name]) != null) {
    console.log(`Found id for ${name} in cache`);

    return cachedId;
  }

  const id =
    name.startsWith('@@')
      ? (await getTeamByName(formatTeamName(name))).id
      : (await getUserIdByEmail(name));

  identityNameIdCache[name] = id;

  return id;
}

async function getTeamByName(name) {
  console.log(`Retrieving team ${name}`);

  const url = `https://dev.azure.com/${ORG}/_apis/projects/${PROJECT}/teams/${name}`;

  const headers = {
    Accept: 'application/json; api-version=7.1-preview.3',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  const res = await fetch(url, { headers });

  if (!res.ok) {
    console.error(await res.text());

    throw new Error(`Couldn't get team "${name}"`);
  }

  return res.json();
}

// TODO: review this function
async function getUserIdByEmail(email) {
  console.log(`Retrieving user id for ${email}`);

  const url = `https://vssps.dev.azure.com/${ORG}/_apis/graph/subjectquery`;

  const headers = {
    Accept: 'application/json; api-version=7.0-preview.1',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const data = {
    query: email,
    subjectKind: ['User'],
  };

  const options = {
    headers,
    method: 'POST',
    body: JSON.stringify(data),
  };

  const res = await fetch(url, options);

  if (!res.ok) {
    console.error(await res.text());

    throw new Error(`Could not resolve descriptor for ${email}`);
  }

  const { value: [user] } = await res.json();
  const subres = await fetch(user._links.storageKey.href, { headers });

  const { value } = await subres.json();

  return value;
}

async function getRepoPolicies(repoId) {
  console.log(`Retrieving repo policies for ${repoId}`);

  const url = `https://dev.azure.com/${ORG}/${PROJECT}/_apis/git/policy/configurations`;

  const headers = {
    Accept: 'application/json; api-version=7.1-preview.1',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  const query = new URLSearchParams({
    refName: `refs/heads/${DEFAULT_BRANCH}`,
    policyType: 'fd2167ab-b0be-447a-8ec8-39368250530e',
    repositoryId: repoId,
  });

  const res = await fetch(`${url}?${query}`, { headers });

  if (!res.ok) {
    console.error(await res.text());

    throw new Error('Could not get repo policies');
  }

  const { value } = await res.json();

  return value;
}

async function createRequiredReviewerPolicy(path, reviewerIds, repoId, branch) {
  console.log(`Creating required reviewer policy for ${path}`);

  const url = `https://dev.azure.com/${ORG}/${PROJECT}/_apis/policy/configurations`;

  const headers = {
    Accept: 'application/json; api-version=7.2-preview.1',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const data = {
    isBlocking: true,
    isEnabled: false, // TODO: flip to true
    type: { id: 'fd2167ab-b0be-447a-8ec8-39368250530e' },
    settings: {
      creatorVoteCounts: false,
      filenamePatterns: [path],
      minimumApproverCount: 1,
      requiredReviewerIds: reviewerIds,
      scope: [{
        matchKind: 'Exact',
        refName: `refs/heads/${branch}`,
        repositoryId: repoId,
      }],
    },
  };

  const options = {
    headers,
    method: 'POST',
    body: JSON.stringify(data),
  };

  const res = await fetch(url, options);

  if (!res.ok) {
    console.error(await res.text());
    throw new Error('Could not create required reviewer policy');
  }
}

async function updateRequiredReviewerPolicy(policy) {
  console.log(`Updating required reviewer policy for path ${policy.settings.filenamePatterns[0]}`)

  delete policy.createdBy;

  const headers = {
    Accept: 'application/json; api-version=7.2-preview.1',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const options = {
    headers,
    method: 'PUT',
    body: JSON.stringify(policy),
  };

  const res = await fetch(policy.url, options);

  if (!res.ok) {
    console.error(await res.text());
    throw new Error('Could not update required reviewer policy');
  }
}

async function deletePolicyConfiguration(id) {
  console.log(`Deleting policy configuration with id ${id}`);

  const url = `https://dev.azure.com/${ORG}/${PROJECT}/_apis/policy/configurations/${id}`;

  const headers = {
    Accept: 'application/json; api-version=7.2-preview.1',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  const options = {
    headers,
    method: 'DELETE'
  };

  const res = await fetch(url, options);

  if (!res.ok) {
    console.error(await res.text());
    throw new Error('Could not update required reviewer policy');
  }
}
