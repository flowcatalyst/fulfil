import { Cron } from 'croner';
import type { FastifyBaseLogger } from 'fastify';
import { runJob } from '@fulfil/framework';
import type { ScheduledTaskDefinition } from './types.js';

export function registerScheduledTasks(
  tasks: readonly ScheduledTaskDefinition[],
  logger: FastifyBaseLogger,
): Cron[] {
  return tasks.map((task) => {
    logger.info({ taskName: task.name, schedule: task.schedule }, 'Registering scheduled task');

    return new Cron(task.schedule, async () => {
      await runJob({ name: task.name, identity: task.identity }, async (scope) => {
        logger.info({ taskName: task.name, executionId: scope.executionId }, 'Running scheduled task');
        try {
          await task.handler(scope);
        } catch (error: unknown) {
          logger.error({ taskName: task.name, executionId: scope.executionId, error }, 'Scheduled task failed');
        }
      });
    });
  });
}
