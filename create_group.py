#!/usr/bin/env python3

import argparse
import az_sdk

parser = argparse.ArgumentParser()
parser.add_argument("-g", "--group-name", help="Group name")
args = parser.parse_args()
group_name = args.group_name

existing_group = az_sdk.get_group_by_name(group_name)

if existing_group is not None:
    print(f'Group "{group_name}" already exists')

    exit(0)

az_sdk.create_group(group_name)
