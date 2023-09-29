#!/usr/bin/env python

import argparse
import json
import az_sdk

CODEOWNER_POSTFIX = '-codeowners'


def pprint(d):
    print(json.dumps(d, indent=2))


parser = argparse.ArgumentParser()
parser.add_argument(
        "-c",
        "--codegroups",
        help="CODEGROUPS.json file path",
        default="./CODEGROUPS.json")

args = parser.parse_args()


def get_existing_teams():
    return [t for t in az_sdk.list_teams()
            if t['name'].endswith(CODEOWNER_POSTFIX)]


def get_existing_groups():
    return [g for g in az_sdk.list_groups()
            if g['displayName'].endswith(CODEOWNER_POSTFIX)]


def format_team_name(name):
    return f"{name.replace('@@', '')}{CODEOWNER_POSTFIX}"


codegroups = {}

with open(args.codegroups, 'r') as codegroups_file:
    raw_codegroups = json.load(codegroups_file)['groups']
    for name, members in raw_codegroups.items():
        codegroups[format_team_name(name)] = members

existing_teams = get_existing_teams()
existing_team_names = {t['name'] for t in existing_teams}

codegroup_team_names = codegroups.keys()
teams_to_create = codegroup_team_names - existing_team_names  # set difference

for name in teams_to_create:
    print(f'Creating team {name}')
    az_sdk.create_team(name)

# NOTE! This might not catch the latest changes due to sync time
# Add wait for created groups to be available in response?
# existing_teams = get_existing_teams()
existing_groups = get_existing_groups()

for team_name in codegroup_team_names:
    group = next(filter(
               lambda t: t['displayName'] == team_name,
               existing_groups
           ))

    group_id = group['descriptor']

    existing_users = az_sdk.list_users_in_team(team_name)
    users = set(codegroups[team_name])
    existing_user_emails = {u['identity']['uniqueName']
                            for u in existing_users}

    users_to_add = users - existing_user_emails

    for user in users_to_add:
        print(f'Adding user "{user}" to team "{team_name}"')
        az_sdk.add_user_to_group(user, group_id)

    users_to_remove = existing_user_emails - users

    for user in users_to_remove:
        print(f'Removing user "{user}" from team "{team_name}"')
        az_sdk.remove_user_from_group(user, group_id)
