#!/usr/bin/env python3

import argparse
import json
import az_sdk

parser = argparse.ArgumentParser()
parser.add_argument(
        "-c",
        "--codeowners",
        help="CODEOWNERS.json",
        default="./CODEOWNERS.json")
parser.add_argument(
        "-r",
        "--repo",
        help="Repository name")

args = parser.parse_args()
repo_name = args.repo
identity_name_id_map = {}

def pprint(map):
    print(json.dumps(map, indent=2))


# Convert codeowners to better format
def format_codeowners(codeowners):
    print('Parsing codeowners file')
    pathmap = {}

    for f in codeowners['filemap']:
        for path, name in f.items():
            pathmap[name] = path

    path_group_map = {}

    for name, reviewers in codeowners['functionalBlocks'].items():
        owners = set(reviewers['owners'])
        additional_approvers = set(reviewers['additionalApprovers'])
        path_group_map[pathmap[name]] = list(owners | additional_approvers)

    return path_group_map


def get_identity_id(name):
    print(f'retrieving identity id for {name}')

    # Check cache for id
    if (id := identity_name_id_map.get(name, None)) is not None:
        return id

    if name.startswith("@@"):
        id = az_sdk.get_group_by_name(name)['originId']
    else:
        id = az_sdk.get_user_by_email(name)['id']

    # Cache id for future use
    identity_name_id_map[name] = id

    return id


def get_policy_by_path_filter(policies, path_filter):
    return next(
        filter(
            lambda p: path_filter in p['settings']['filenamePatterns'],
            policies),
        None)


with open(args.codeowners, 'r') as codeowners_file:
    codeowners = format_codeowners(json.load(codeowners_file))

for path, owners in codeowners.items():
    print(f'converting ids for path "{path}"')
    codeowners[path] = [get_identity_id(name) for name in owners]

repo_id = az_sdk.get_repo_by_name(repo_name)['id']
policies = az_sdk.get_repo_policies_by_repo_name('pipeline-commons')

for path, owners in codeowners.items():
    policy = get_policy_by_path_filter(policies, path)

    if policy is None:
        print(f'Creating required reviewer policy for path {path}')
        az_sdk.create_required_reviewer_policy(
            path_filter=[path],
            required_reviewer_ids=owners,
            repo_id=repo_id)

        continue

    existing_reviewers = policy['settings']['requiredReviewerIds']
    reviewer_diff = set(existing_reviewers) ^ set(owners)

    if len(reviewer_diff) > 0:
        print(f'Updating reviewers for path "{path}"')
        policy['settings']['requiredReviewerIds'] = owners
        az_sdk.update_required_reviewer_policy(policy)
