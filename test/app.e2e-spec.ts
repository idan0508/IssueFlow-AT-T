import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  // =========================================================================
  // SMOKE TESTS
  // =========================================================================
  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('IssueFlow is running!');
  });

  // =========================================================================
  // OPTIMISTIC LOCKING (E2E)
  // =========================================================================
  describe('Optimistic locking (e2e)', () => {
    const createTestContext = async () => {
      const suffix = Date.now();
      const username = `user_${suffix}`;
      const password = 'secret';

      const userResponse = await request(app.getHttpServer())
        .post('/users')
        .send({
          username,
          email: `${username}@example.com`,
          fullName: 'Test User',
          role: 'DEVELOPER',
          password,
        })
        .expect(200);

      const userId = userResponse.body.id;

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(200);

      const accessToken = loginResponse.body.accessToken;

      const projectResponse = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Locking Project',
          description: 'Locking tests',
          ownerId: userId,
        })
        .expect(200);

      const projectId = projectResponse.body.id;

      const ticketResponse = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Optimistic lock ticket',
          description: 'Test ticket',
          status: 'TODO',
          priority: 'LOW',
          type: 'BUG',
          projectId,
          assigneeId: userId,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      const ticketId = ticketResponse.body.id;

      const commentResponse = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          authorId: userId,
          content: 'Initial comment',
        })
        .expect(200);

      return {
        accessToken,
        ticketId,
        commentId: commentResponse.body.id,
      };
    };

    // Sub-test: Ensuring tickets reject stale version updates with 409.
    it('rejects concurrent ticket updates with a 409 conflict', async () => {
      const { accessToken, ticketId } = await createTestContext();

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'User A update',
          version: 1,
        })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'User B update',
          version: 1,
        })
        .expect(409);
    });

    // Sub-test: Ensuring comments reject stale version updates with 409.
    it('rejects concurrent comment updates with a 409 conflict', async () => {
      const { accessToken, ticketId, commentId } = await createTestContext();

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'User A update',
          version: 1,
        })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'User B update',
          version: 1,
        })
        .expect(409);
    });
  });

  // =========================================================================
  // FEATURE 3.8: AUTO ASSIGNMENT & WORKLOAD ENDPOINT TESTS
  // =========================================================================
  describe('Feature 3.8: Auto Assignment by Workload (e2e)', () => {
    const createUser = async (suffix: string) => {
      const username = `user_${suffix}`;
      const password = 'secret';

      const response = await request(app.getHttpServer())
        .post('/users')
        .send({
          username,
          email: `${username}@example.com`,
          fullName: 'Test User',
          role: 'DEVELOPER',
          password,
        })
        .expect(200);

      return { id: response.body.id, username, password };
    };

    const login = async (username: string, password: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(200);

      return response.body.accessToken as string;
    };

    const createProject = async (
      accessToken: string,
      ownerId: number,
      name: string,
    ) => {
      const response = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name,
          description: 'Workload tests',
          ownerId,
        })
        .expect(200);

      return response.body.id as number;
    };

    const createTicket = async (options: {
      accessToken: string;
      projectId: number;
      title: string;
      assigneeId?: number;
      status?: string;
    }) => {
      const response = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${options.accessToken}`)
        .send({
          title: options.title,
          description: 'Test ticket',
          status: options.status ?? 'TODO',
          priority: 'LOW',
          type: 'BUG',
          projectId: options.projectId,
          assigneeId: options.assigneeId,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      return response.body as { assignee?: { id: number }; assigneeId?: number };
    };

    // Sub-test: Verifying auto-assignment to the developer with the lowest workload.
    it('automatically assigns a ticket to the least loaded DEVELOPER in the project', async () => {
      const suffix = Date.now().toString();
      const userA = await createUser(`${suffix}_a`);
      const userB = await createUser(`${suffix}_b`);
      const accessToken = await login(userA.username, userA.password);
      const projectId = await createProject(accessToken, userA.id, 'Auto Assign');

      await createTicket({
        accessToken,
        projectId,
        title: 'User A open ticket',
        assigneeId: userA.id,
        status: 'TODO',
      });

      await createTicket({
        accessToken,
        projectId,
        title: 'User B done ticket',
        assigneeId: userB.id,
        status: 'DONE',
      });

      const response = await createTicket({
        accessToken,
        projectId,
        title: 'Auto assigned ticket',
      });

      const assignedId = response.assignee?.id ?? response.assigneeId;
      expect(assignedId).toBe(userB.id);
    });

    // Sub-test: Verifying tie-breaker assigns the lowest user ID.
    it('breaks ties using the oldest registrant rule (lowest user ID first)', async () => {
      const suffix = Date.now().toString();
      const userC = await createUser(`${suffix}_c`);
      const userD = await createUser(`${suffix}_d`);
      const accessToken = await login(userC.username, userC.password);
      const projectId = await createProject(accessToken, userC.id, 'Tie Break');

      await createTicket({
        accessToken,
        projectId,
        title: 'User C done ticket',
        assigneeId: userC.id,
        status: 'DONE',
      });

      await createTicket({
        accessToken,
        projectId,
        title: 'User D done ticket',
        assigneeId: userD.id,
        status: 'DONE',
      });

      const response = await createTicket({
        accessToken,
        projectId,
        title: 'Auto assigned tie ticket',
      });

      const assignedId = response.assignee?.id ?? response.assigneeId;
      expect(assignedId).toBe(userC.id);
    });

    // Sub-test: Verifying workload endpoint returns 404 for unknown project IDs.
    it('returns 404 for the workload API if the project ID is unknown', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_workload`);
      const accessToken = await login(user.username, user.password);

      await request(app.getHttpServer())
        .get('/projects/999999/workload')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    // Sub-test: Verifying workload response shape and ascending sort by openTicketCount.
    it('returns a list of users sorted by openTicketCount ascending', async () => {
      const suffix = Date.now().toString();
      const userA = await createUser(`${suffix}_wa`);
      const userB = await createUser(`${suffix}_wb`);
      const accessToken = await login(userA.username, userA.password);
      const projectId = await createProject(accessToken, userA.id, 'Workload Sort');

      await createTicket({
        accessToken,
        projectId,
        title: 'User A open ticket 1',
        assigneeId: userA.id,
        status: 'TODO',
      });

      await createTicket({
        accessToken,
        projectId,
        title: 'User A open ticket 2',
        assigneeId: userA.id,
        status: 'IN_PROGRESS',
      });

      await createTicket({
        accessToken,
        projectId,
        title: 'User B open ticket',
        assigneeId: userB.id,
        status: 'TODO',
      });

      const response = await request(app.getHttpServer())
        .get(`/projects/${projectId}/workload`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as Array<{
        userId: number;
        username: string;
        openTicketCount: number;
      }>;

      expect(Array.isArray(body)).toBe(true);
      body.forEach((entry) => {
        expect(typeof entry.userId).toBe('number');
        expect(typeof entry.username).toBe('string');
        expect(typeof entry.openTicketCount).toBe('number');
      });

      for (let i = 1; i < body.length; i += 1) {
        expect(body[i - 1].openTicketCount).toBeLessThanOrEqual(
          body[i].openTicketCount,
        );
      }

      const userAEntry = body.find((entry) => entry.userId === userA.id);
      const userBEntry = body.find((entry) => entry.userId === userB.id);

      expect(userAEntry?.openTicketCount).toBe(2);
      expect(userBEntry?.openTicketCount).toBe(1);
    });
  });

  // =========================================================================
  // FEATURE 3.1 - AUDIT LOGS
  // =========================================================================
  describe('Feature 3.1 - Audit Logs', () => {
    const createUser = async (suffix: string) => {
      const username = `user_${suffix}`;
      const password = 'secret';

      const response = await request(app.getHttpServer())
        .post('/users')
        .send({
          username,
          email: `${username}@example.com`,
          fullName: 'Test User',
          role: 'DEVELOPER',
          password,
        })
        .expect(200);

      return { id: response.body.id, username, password };
    };

    const login = async (username: string, password: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(200);

      return response.body.accessToken as string;
    };

    const createProject = async (
      accessToken: string,
      ownerId: number,
      name: string,
    ) => {
      const response = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name,
          description: 'Audit log tests',
          ownerId,
        })
        .expect(200);

      return response.body.id as number;
    };

    // Sub-test: Verifying ticket creation generates a filtered audit log entry.
    it('should automatically log ticket creation and allow filtered retrieval', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_audit`);
      const accessToken = await login(user.username, user.password);

      // Create a project so the new ticket can be created under it.
      const projectId = await createProject(
        accessToken,
        user.id,
        'Audit Log Project',
      );

      // Create a ticket using an authenticated request to generate an audit log entry.
      const ticketResponse = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Audit log ticket',
          description: 'Ticket for audit log test',
          status: 'TODO',
          priority: 'LOW',
          type: 'BUG',
          projectId,
          assigneeId: user.id,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      const ticketId = ticketResponse.body.id as number;

      // Fetch audit logs filtered to the specific ticket and validate the log payload.
      const logsResponse = await request(app.getHttpServer())
        .get(`/audit-logs?entityType=TICKET&entityId=${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const logs = logsResponse.body as Array<{
        action: string;
        actor: string;
        entityId: number;
      }>;

      expect(Array.isArray(logs)).toBe(true);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('CREATE');
      expect(logs[0].actor).toBe('USER');
      expect(logs[0].entityId).toBe(ticketId);
    });

    // Sub-test: Verifying project creation generates a filtered audit log entry.
    it('should automatically log project creation and allow filtered retrieval', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_audit_project`);
      const accessToken = await login(user.username, user.password);

      // Create a project using an authenticated request to generate an audit log entry.
      const projectResponse = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Audit log project',
          description: 'Project for audit log test',
          ownerId: user.id,
        })
        .expect(200);

      const projectId = projectResponse.body.id as number;

      // Fetch audit logs filtered to the specific project and validate the log payload.
      const logsResponse = await request(app.getHttpServer())
        .get(`/audit-logs?entityType=PROJECT&entityId=${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const logs = logsResponse.body as Array<{
        action: string;
        entityType: string;
      }>;

      expect(Array.isArray(logs)).toBe(true);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('CREATE');
      expect(logs[0].entityType).toBe('PROJECT');
    });

    // Sub-test: Verifying comment creation generates a filtered audit log entry.
    it('should automatically log comment creation and allow filtered retrieval', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_audit_comment`);
      const accessToken = await login(user.username, user.password);

      // Create a project to host a ticket for the new comment.
      const projectId = await createProject(
        accessToken,
        user.id,
        'Audit Log Comment Project',
      );

      // Create a ticket to attach the new comment to.
      const ticketResponse = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Audit log comment ticket',
          description: 'Ticket for comment audit log test',
          status: 'TODO',
          priority: 'LOW',
          type: 'BUG',
          projectId,
          assigneeId: user.id,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      const ticketId = ticketResponse.body.id as number;

      // Create a comment using an authenticated request to generate an audit log entry.
      const commentResponse = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          authorId: user.id,
          content: 'Audit log comment',
        })
        .expect(200);

      const commentId = commentResponse.body.id as number;

      // Fetch audit logs filtered to the specific comment and validate the log payload.
      const logsResponse = await request(app.getHttpServer())
        .get(`/audit-logs?entityType=COMMENT&entityId=${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const logs = logsResponse.body as Array<{
        action: string;
        entityType: string;
      }>;

      expect(Array.isArray(logs)).toBe(true);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('CREATE');
      expect(logs[0].entityType).toBe('COMMENT');
    });
  });
});
