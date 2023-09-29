import json
import subprocess
import requests

# TODO: change default branch name to master when porting
DEFAULT_BRANCH = 'main'


def run(cmd):
    res = subprocess.run(cmd, shell=True, text=True, capture_output=True)

    if res.returncode != 0:
        print(res.stderr)

        exit(res.returncode)

    return res


#  def run_parallel(cmds):
#      procs = [Popen(i, shell=True) for i in cmds]
#      for p in procs:
#          print(f'wait for {p}')
#          p.wait()


def run_and_parse(cmd):
    return json.loads(run(cmd).stdout)


def get_access_token():
    response = run_and_parse('az account get-access-token')

    return response['accessToken']


def list_teams():
    cmd = 'az devops team list'

    return run_and_parse(cmd)


def create_team(name):
    cmd = f'az devops team create --name {name}'

    return run(cmd)


def list_users_in_team(name):
    cmd = f'az devops team list-member --team {name}'

    return run_and_parse(cmd)


def list_groups():
    cmd = 'az devops security group list'

    return run_and_parse(cmd)['graphGroups']


def add_user_to_group(email, group_id):
    cmd = f'az devops security group membership add \
            --group-id {group_id} \
            --member-id {email}'

    return run(cmd)


def remove_user_from_group(email, group_id):
    cmd = f'az devops security group membership remove \
            --group-id {group_id} \
            --member-id {email} -y'

    return run(cmd)


def get_user_by_email(email):
    cmd = f'az devops user show --user {email}'

    return run_and_parse(cmd)


def get_repo_by_name(name):
    cmd = f'az repos show -r {name}'

    return run_and_parse(cmd)


def get_repo_policies(repo_id, branch=DEFAULT_BRANCH):
    cmd = f'az repos policy list \
            --repository-id {repo_id} \
            --branch {branch}'

    return run_and_parse(cmd)


def get_repo_policies_by_repo_name(repo_name):
    repo = get_repo_by_name(repo_name)

    return get_repo_policies(repo['id'])


def create_required_reviewer_policy(
        path_filter,
        required_reviewer_ids,
        repo_id,
        ref=f'refs/heads/{DEFAULT_BRANCH}',
        org='jagekransdev',
        project='SHB-test'):

    url = f'https://dev.azure.com/{org}/{project}/_apis/policy/configurations'

    headers = {
        'Accept': 'application/json; api-version=7.2-preview.1',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {get_access_token()}'}

    data = {
        'isBlocking': True,
        'isEnabled': True,
        'type': {'id': 'fd2167ab-b0be-447a-8ec8-39368250530e'},
        'settings': {
            'creatorVoteCounts': False,
            'filenamePatterns': path_filter,
            'minimumApproverCount': 1,
            'requiredReviewerIds': required_reviewer_ids,
            'scope': [{
                'matchKind': 'Exact',
                'refName': ref,
                'repositoryId': repo_id
            }]}}

    requests.post(url, json=data, headers=headers)


def update_required_reviewer_policy(
        existing_updated_spec,  # from get/list request
        org='jagekransdev',
        project='SHB-test'):

    # Remove 'createdBy' to skip all possible errors from it
    existing_updated_spec.pop('createdBy', None)

    url = existing_updated_spec['url']

    headers = {
        'Accept': 'application/json; api-version=7.2-preview.1',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {get_access_token()}'}

    requests.put(url, json=existing_updated_spec, headers=headers)
