import {
    ElasticBeanstalkClient,
    DescribeEnvironmentResourcesCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import {
    AutoScalingClient,
    DescribeAutoScalingGroupsCommand,
} from '@aws-sdk/client-auto-scaling';
import { EC2Client, DescribeNatGatewaysCommand } from '@aws-sdk/client-ec2';
import { environments, VPC_ID } from './config.js';

const eb = new ElasticBeanstalkClient({ region: 'ap-south-1' });
const asg = new AutoScalingClient({ region: 'ap-south-1' });
const ec2 = new EC2Client({ region: 'ap-south-1' });

export const checkStatus = async () => {
    console.log(
        'Checking status of environments:',
        JSON.stringify(environments.map((e) => e.environmentName))
    );

    // Check Auto Scaling Group status for each environment
    const asgStatusResults = await Promise.all(
        environments.map(async ({ environmentName, environmentId }) => {
            console.log(
                `Checking ASG status for environment: ${environmentName}`
            );

            try {
                const envData = await eb.send(
                    new DescribeEnvironmentResourcesCommand({
                        EnvironmentName: environmentName,
                        EnvironmentId: environmentId,
                    })
                );

                const asgName =
                    envData.EnvironmentResources.AutoScalingGroups[0].Name;
                console.log(
                    `Found ASG: ${asgName} for environment: ${environmentName}`
                );

                const asgDesc = await asg.send(
                    new DescribeAutoScalingGroupsCommand({
                        AutoScalingGroupNames: [asgName],
                    })
                );

                const suspendedProcesses =
                    asgDesc.AutoScalingGroups?.[0]?.SuspendedProcesses || [];
                const isSuspended = suspendedProcesses.length > 0;

                console.log(
                    `Environment ${environmentName} ASG status: ${
                        isSuspended ? 'Suspended' : 'Active'
                    }`
                );
                return isSuspended;
            } catch (err) {
                console.error(
                    `Failed to check status for ${environmentName}:`,
                    err
                );
                throw err;
            }
        })
    );

    // Check NAT Gateway status
    console.log(`Checking NAT Gateway status for VPC: ${VPC_ID}`);
    const natResult = await ec2.send(
        new DescribeNatGatewaysCommand({
            Filter: [{ Name: 'vpc-id', Values: [VPC_ID] }],
        })
    );

    const activeNatGateways = natResult.NatGateways?.filter(
        (nat) => nat.State === 'available'
    );
    const natActive = activeNatGateways?.length > 0;

    console.log(`NAT Gateway status: ${natActive ? 'Active' : 'Inactive'}`);
    if (natActive) {
        console.log(
            `Found ${
                activeNatGateways.length
            } active NAT gateway(s): ${activeNatGateways
                .map((n) => n.NatGatewayId)
                .join(', ')}`
        );
    }

    // All environments must have suspended processes and no active NAT gateway to be considered "Stopped"
    const allStopped = asgStatusResults.every(Boolean) && !natActive;

    console.log(
        `Infrastructure overall status: ${allStopped ? 'Stopped' : 'Running'}`
    );
    return allStopped ? 'Stopped' : 'Running';
};
