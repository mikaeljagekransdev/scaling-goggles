#!/usr/bin/env node

const fs = require('fs');

const CODEOWNER_POSTFIX = '-codeowners';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const ORG = 'jagekransdev';
const PROJECT = 'SHB-test';

// TODO: get from parameters
const codegroupsFile = './CODEGROUPS.json'

run();

async function run() {
  const rawCodegroups = JSON.parse(fs.readFileSync(codegroupsFile))['groups'];
  const codegroups =
    Object.entries(rawCodegroups).reduce((acc, [name, members]) => {
      acc[formatTeamName(name)] = members;

      return acc;
    }, {});

  const existingTeamNames = (await getExistingTeams()).map(t => t.name);
  const codegroupTeamNames = Object.keys(codegroups);
  const teamsToCreate = setDifference(codegroupTeamNames, existingTeamNames);

  console.log('Creating teams');

  await Promise.all(Array.from(teamsToCreate).map(createTeam));

  const existingGroups = await getExistingGroups();

  console.log('Populating teams');

  codegroupTeamNames.forEach(async teamName => {
    console.log(`Populating team ${teamName}`);

    const group = existingGroups.find(g => g.displayName == teamName);

    if (group == null) {
      throw new Error(`Group ${teamName} not found`);
    }

    const existingUsers = await listUsersInTeam(teamName);
    const existingUserEmails = existingUsers.map(u => u.identity.uniqueName);
    const usersToAdd = setDifference(codegroups[teamName], existingUserEmails);
    const userDescriptorsToAdd = await Promise.all(usersToAdd.map(getUserDescriptor));

    console.log(`Adding users to group ${teamName}`);
    const addUserOps = userDescriptorsToAdd.map(u => addUserToGroup(u, group.descriptor));
    await Promise.all(addUserOps);
    console.log(`Users added to ${teamName}`);
  });
}

function formatTeamName(name) {
  return `${name.replace('@@', '')}${CODEOWNER_POSTFIX}`;
}

function setDifference(a, b) {
  return a.filter(item => !(new Set(b)).has(item));
}

async function getExistingTeams() {
  const url = `https://dev.azure.com/${ORG}/_apis/projects/${PROJECT}/teams`;

  const headers = {
    Accept: 'application/json; api-version=7.0-preview.3',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error('Failed to fetch teams');
  }

  const { value } = await res.json();

  return value.filter(t => t.name.endsWith(CODEOWNER_POSTFIX));
}

async function createTeam(name) {
  const url = `https://dev.azure.com/${ORG}/_apis/projects/${PROJECT}/teams`;

  const headers = {
    Accept: 'application/json; api-version=7.0-preview.3',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const data = { name };

  const options = {
    headers,
    method: 'POST',
    body: JSON.stringify(data),
  };

  const res = await fetch(url, options);

  if (!res.ok) {
    throw new Error('Failed to create team');
  }
}

async function listUsersInTeam(teamName) {
  const url = `https://dev.azure.com/${ORG}/_apis/projects/${PROJECT}/teams/${teamName}/members`;

  const headers = {
    Accept: 'application/json; api-version=7.0',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`Could not list users in team ${teamName}`);
  }

  const { value } = await res.json();

  return value;
}

// TODO: continuation token/pagination?
async function getExistingGroups() {
  const url = `https://vssps.dev.azure.com/${ORG}/_apis/graph/groups`;

  const headers = {
    Accept: 'application/json; api-version=7.0-preview.1',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error('Failed to fetch groups');
  }

  const { value } = await res.json();

  return value.filter(g => g.displayName.endsWith(CODEOWNER_POSTFIX));
}

async function getUserDescriptor(email) {
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

  const { value: [{ descriptor }] } = await res.json();

  return descriptor;
}

async function addUserToGroup(userDescriptor, groupDescriptor) {
  const url = `https://vssps.dev.azure.com/${ORG}/_apis/graph/memberships/${userDescriptor}/${groupDescriptor}`;

  const headers = {
    Accept: 'application/json; api-version=7.1-preview.1',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  const options = {
    headers,
    method: 'PUT',
  };

  const res = await fetch(url, options);

  if (!res.ok) {
    console.error(await res.text());

    throw new Error('Could not add user to group');
  }
}
