import subprocess
import json

AZ_GROUP_BASE_CMD = 'az devops security group'


def run(cmd):
    res = subprocess.run(cmd, shell=True, text=True, capture_output=True)

    if res.returncode != 0:
        print(res.stderr)

        exit(res.returncode)

    return res


def run_and_parse(cmd):
    return json.loads(run(cmd).stdout)


def list_groups():
    cmd = f'{AZ_GROUP_BASE_CMD} list'
    groups = run_and_parse(cmd)['graphGroups']

    return groups


def get_group_by_name(name):
    groups = list_groups()
    group = next(filter(lambda g: g['displayName'] == name, groups), None)

    return group


def create_group(name):
    cmd = f'{AZ_GROUP_BASE_CMD} create --name "{name}"'

    return run(cmd)


def add_user_to_group(email, group_id):
    cmd = f'{AZ_GROUP_BASE_CMD} membership add \
            --group-id {group_id} \
            --member-id {email}'

    return run(cmd)


def remove_user_from_group(email, group_id):
    cmd = f'{AZ_GROUP_BASE_CMD} membership remove \
            --group-id {group_id} \
            --member-id {email} -y'

    return run(cmd)
