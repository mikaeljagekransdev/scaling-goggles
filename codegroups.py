#!/usr/bin/env python3

import argparse
import json
import az_sdk

parser = argparse.ArgumentParser()
parser.add_argument(
        "-c",
        "--codegroups",
        help="CODEGROUPS.json file path",
        default="./CODEGROUPS.json")

args = parser.parse_args()


def get_existing_groups():
    return [g for g in az_sdk.list_groups()
            if g['displayName'].startswith('@@')]


with open(args.codegroups, 'r') as codegroups_file:
    codegroups = json.load(codegroups_file)['groups']

existing_groups = get_existing_groups()
existing_group_names = {g['displayName'] for g in existing_groups}

group_names = codegroups.keys()  # is a set-like object
groups_to_create = group_names - existing_group_names  # set difference

for group_name in groups_to_create:
    print(f'Creating group {group_name}')
    az_sdk.create_group(group_name)

# NOTE! This might not catch the latest changes due to sync time
existing_groups = get_existing_groups()

for group_name in group_names:
    group = next(filter(
                lambda g: g['displayName'] == group_name,
                existing_groups
            ))
    group_id = group['descriptor']

    existing_users = az_sdk.list_users_in_group(group_id).values()
    existing_user_emails = {u['mailAddress'] for u in existing_users}
    users_to_add = set(codegroups[group_name]) - existing_user_emails

    for user in users_to_add:
        print(f'Adding user "{user}" to group "{group_name}"')
        az_sdk.add_user_to_group(user, group_id)
