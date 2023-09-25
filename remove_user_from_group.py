#!/usr/bin/env python3

import argparse
import az_sdk

parser = argparse.ArgumentParser()
parser.add_argument("-g", "--group-name", help="Group name")
parser.add_argument("-u", "--user-email", help="User email")
args = parser.parse_args()

group_name = args.group_name
user_email = args.user_email

group = az_sdk.get_group_by_name(group_name)

if group is None:
    print(f'Group "{group_name}" does not exist')

    exit(0)

az_sdk.remove_user_from_group(user_email, group['descriptor'])
