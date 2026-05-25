import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { TicketsEscalationService } from '../src/tickets/tickets-escalation.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
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
  // FEATURE 3.2 - TICKET DEPENDENCIES
  // =========================================================================
  describe('Feature 3.2 - Ticket Dependencies', () => {
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
          description: 'Dependency tests',
          ownerId,
        })
        .expect(200);

      return response.body.id as number;
    };

    const createTicket = async (options: {
      accessToken: string;
      projectId: number;
      title: string;
      status?: string;
    }) => {
      const response = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${options.accessToken}`)
        .send({
          title: options.title,
          description: 'Dependency test ticket',
          status: options.status ?? 'TODO',
          priority: 'LOW',
          type: 'BUG',
          projectId: options.projectId,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      return response.body as { id: number; version: number };
    };

    // Sub-test: Verifying a dependency can be added between tickets in the same project.
    it('successfully adds a dependency between two tickets in the same project', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_dep_add`);
      const accessToken = await login(user.username, user.password);
      const projectId = await createProject(accessToken, user.id, 'Dependency Add');

      const blocked = await createTicket({
        accessToken,
        projectId,
        title: 'Blocked ticket',
      });

      const blocker = await createTicket({
        accessToken,
        projectId,
        title: 'Blocker ticket',
      });

      // Add the blocker to the blocked ticket.
      await request(app.getHttpServer())
        .post(`/tickets/${blocked.id}/dependencies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockedBy: blocker.id })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/tickets/${blocked.id}/dependencies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(blocker.id);
    });

    // Sub-test: Verifying dependencies cannot cross project boundaries.
    it('prevents dependency addition if tickets belong to different projects', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_dep_cross`);
      const accessToken = await login(user.username, user.password);
      const projectAId = await createProject(accessToken, user.id, 'Project A');
      const projectBId = await createProject(accessToken, user.id, 'Project B');

      const blocked = await createTicket({
        accessToken,
        projectId: projectAId,
        title: 'Blocked ticket A',
      });

      const blocker = await createTicket({
        accessToken,
        projectId: projectBId,
        title: 'Blocker ticket B',
      });

      await request(app.getHttpServer())
        .post(`/tickets/${blocked.id}/dependencies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockedBy: blocker.id })
        .expect(400);
    });

    // Sub-test: Verifying DONE transition is blocked when dependencies are unresolved.
    it('prevents a ticket from moving to DONE if its blocker is not DONE', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_dep_blocked`);
      const accessToken = await login(user.username, user.password);
      const projectId = await createProject(accessToken, user.id, 'Dependency Block');

      const blocked = await createTicket({
        accessToken,
        projectId,
        title: 'Blocked ticket',
      });

      const blocker = await createTicket({
        accessToken,
        projectId,
        title: 'Blocker ticket',
      });

      // Add a dependency so the blocked ticket cannot complete yet.
      await request(app.getHttpServer())
        .post(`/tickets/${blocked.id}/dependencies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockedBy: blocker.id })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${blocked.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'DONE', version: blocked.version })
        .expect(400);
    });

    // Sub-test: Verifying DONE transition succeeds after blocker completion or removal.
    it('allows the transition to DONE once the blocker is DONE', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_dep_done`);
      const accessToken = await login(user.username, user.password);
      const projectId = await createProject(accessToken, user.id, 'Dependency Done');

      const blocked = await createTicket({
        accessToken,
        projectId,
        title: 'Blocked ticket',
      });

      const blocker = await createTicket({
        accessToken,
        projectId,
        title: 'Blocker ticket',
      });

      // Add a dependency, then resolve the blocker before completing the blocked ticket.
      await request(app.getHttpServer())
        .post(`/tickets/${blocked.id}/dependencies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockedBy: blocker.id })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${blocker.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'DONE', version: blocker.version })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${blocked.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'DONE', version: blocked.version })
        .expect(200);
    });

    // Sub-test: Verifying dependency removal succeeds and persists.
    it('successfully removes a dependency', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_dep_remove`);
      const accessToken = await login(user.username, user.password);
      const projectId = await createProject(accessToken, user.id, 'Dependency Remove');

      const blocked = await createTicket({
        accessToken,
        projectId,
        title: 'Blocked ticket',
      });

      const blocker = await createTicket({
        accessToken,
        projectId,
        title: 'Blocker ticket',
      });

      await request(app.getHttpServer())
        .post(`/tickets/${blocked.id}/dependencies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockedBy: blocker.id })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/tickets/${blocked.id}/dependencies/${blocker.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/tickets/${blocked.id}/dependencies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });

  // =========================================================================
  // FEATURE 3.6 - MENTION MECHANISM IN COMMENTS
  // =========================================================================
  describe('Feature 3.6 - Mention Mechanism in Comments', () => {
    let accessToken: string;
    let ticketId: number;

    const createUser = async (suffix: string) => {
      const username = `user_${suffix}`;
      const password = 'secret';

      const response = await request(app.getHttpServer())
        .post('/users')
        .send({
          username,
          email: `${username}@example.com`,
          fullName: `Test User ${suffix}`,
          role: 'DEVELOPER',
          password,
        })
        .expect(200);

      return {
        id: response.body.id,
        username,
        password,
        fullName: `Test User ${suffix}`,
      };
    };

    const login = async (username: string, password: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(200);

      return response.body.accessToken as string;
    };

    const createProject = async (ownerId: number, name: string) => {
      const response = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name,
          description: 'Mention tests',
          ownerId,
        })
        .expect(200);

      return response.body.id as number;
    };

    const createTicket = async (projectId: number) => {
      const response = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Mention test ticket',
          description: 'Ticket for mention tests',
          status: 'TODO',
          priority: 'LOW',
          type: 'BUG',
          projectId,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      return response.body.id as number;
    };

    const createComment = async (
      ticketIdToUse: number,
      authorId: number,
      content: string,
    ) => {
      const response = await request(app.getHttpServer())
        .post(`/tickets/${ticketIdToUse}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          authorId,
          content,
        })
        .expect(200);

      return response.body as { id: number };
    };

    beforeEach(async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_mention_owner`);
      accessToken = await login(user.username, user.password);
      const projectId = await createProject(user.id, 'Mention Project');
      ticketId = await createTicket(projectId);
    });

    // Sub-test: Verifying basic mention flow and metadata shape.
    it('returns mentioned comment with mentionedUsers metadata', async () => {
      const suffix = Date.now().toString();
      const mentioned = await createUser(`${suffix}_mentioned`);

      await createComment(ticketId, mentioned.id, `Hello @${mentioned.username}`);

      const response = await request(app.getHttpServer())
        .get(`/users/${mentioned.id}/mentions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as {
        data: Array<{
          mentionedUsers?: Array<{ id: number; username: string; fullName: string }>;
        }>;
      };

      const match = body.data.find((comment) =>
        (comment.mentionedUsers ?? []).some((user) => user.id === mentioned.id),
      );

      expect(match).toBeDefined();
      expect(match?.mentionedUsers).toEqual([
        {
          id: mentioned.id,
          username: mentioned.username,
          fullName: mentioned.fullName,
        },
      ]);
    });

    // Sub-test: Verifying mentions are matched case-insensitively.
    it('matches mentions regardless of casing', async () => {
      const suffix = Date.now().toString();
      const mentioned = await createUser(`${suffix}_mixed`);
      const mixedCase = `@${mentioned.username}`
        .split('')
        .map((char, index) =>
          index % 2 === 0 ? char.toUpperCase() : char.toLowerCase(),
        )
        .join('');

      await createComment(ticketId, mentioned.id, `Ping ${mixedCase}`);

      const response = await request(app.getHttpServer())
        .get(`/users/${mentioned.id}/mentions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as {
        data: Array<{ mentionedUsers?: Array<{ id: number }> }>;
      };

      const matched = body.data.some((comment) =>
        (comment.mentionedUsers ?? []).some((user) => user.id === mentioned.id),
      );

      expect(matched).toBe(true);
    });

    // Sub-test: Verifying mentions update after comment edits.
    it('re-evaluates mentions when a comment is updated', async () => {
      const suffix = Date.now().toString();
      const userA = await createUser(`${suffix}_user_a`);
      const userB = await createUser(`${suffix}_user_b`);

      const comment = await createComment(ticketId, userA.id, `Hello @${userA.username}`);

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: `Switching to @${userB.username}`,
          version: 1,
        })
        .expect(200);

      const responseA = await request(app.getHttpServer())
        .get(`/users/${userA.id}/mentions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const responseB = await request(app.getHttpServer())
        .get(`/users/${userB.id}/mentions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const bodyA = responseA.body as { data: Array<{ id: number }> };
      const bodyB = responseB.body as { data: Array<{ id: number }> };

      const inUserA = bodyA.data.some((entry) => entry.id === comment.id);
      const inUserB = bodyB.data.some((entry) => entry.id === comment.id);

      expect(inUserA).toBe(false);
      expect(inUserB).toBe(true);
    });

    // Sub-test: Verifying pagination, total count, and newest-first sorting.
    it('returns paginated results sorted by newest first', async () => {
      const suffix = Date.now().toString();
      const mentioned = await createUser(`${suffix}_paged`);

      const first = await createComment(ticketId, mentioned.id, `First @${mentioned.username}`);
      const second = await createComment(ticketId, mentioned.id, `Second @${mentioned.username}`);
      const third = await createComment(ticketId, mentioned.id, `Third @${mentioned.username}`);

      const response = await request(app.getHttpServer())
        .get(`/users/${mentioned.id}/mentions?page=1&pageSize=2`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as { data: Array<{ id: number }>; total: number };

      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(3);

      const returnedIds = body.data.map((entry) => entry.id);
      expect(returnedIds).toEqual([third.id, second.id]);
      expect(returnedIds).not.toContain(first.id);
    });
  });

  // =========================================================================
  // FEATURE 3.3 - ATTACHMENT MANAGEMENT
  // =========================================================================
  describe('Feature 3.3 - Attachment Management', () => {
    let accessToken: string;
    let ticketId: number;
    let attachmentId: number | undefined;

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
      ownerId: number,
      name: string,
    ) => {
      const response = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name,
          description: 'Attachment tests',
          ownerId,
        })
        .expect(200);

      return response.body.id as number;
    };

    const createTicket = async (projectId: number) => {
      const response = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Attachment test ticket',
          description: 'Ticket for attachment tests',
          status: 'TODO',
          priority: 'LOW',
          type: 'BUG',
          projectId,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      return response.body.id as number;
    };

    beforeEach(async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_attach`);
      accessToken = await login(user.username, user.password);
      const projectId = await createProject(user.id, 'Attachment Project');
      ticketId = await createTicket(projectId);
      attachmentId = undefined;
    });

    // Sub-test: Verifying a valid file upload succeeds and returns metadata.
    it('successfully uploads a valid file', async () => {
      const buffer = Buffer.from('hello world');

      const response = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', buffer, {
          filename: 'test.txt',
          contentType: 'text/plain',
        })
        .expect((res) => {
          if (res.status !== 200) {
            throw new Error(
              'Server rejected file: ' + JSON.stringify(res.body),
            );
          }
        });

      expect(response.body.id).toBeDefined();
      expect(response.body.ticketId).toBe(ticketId);
      expect(response.body.filename).toBe('test.txt');
      expect(response.body.contentType).toBe('text/plain');

      attachmentId = response.body.id as number;
    });

    // Sub-test: Verifying uploads exceeding 10MB are rejected.
    it('rejects a file exceeding 10MB', async () => {
      const buffer = Buffer.alloc(10 * 1024 * 1024 + 1);

      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', buffer, 'huge.png')
        .expect(400);
    });

    // Sub-test: Verifying invalid file types are rejected.
    it('rejects an invalid file type', async () => {
      const buffer = Buffer.from('invalid');

      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', buffer, {
          filename: 'test.gif',
          contentType: 'image/gif',
        })
        .expect(400);
    });

    // Sub-test: Verifying attachment deletion succeeds.
    it('successfully deletes an attachment', async () => {
      const buffer = Buffer.from('hello world');

      const response = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', buffer, {
          filename: 'test.txt',
          contentType: 'text/plain',
        })
        .expect((res) => {
          if (res.status !== 200) {
            throw new Error(
              'Server rejected file: ' + JSON.stringify(res.body),
            );
          }
        });

      const idToDelete = response.body.id as number;

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/attachments/${idToDelete}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
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

  // =========================================================================
  // FEATURE 3.4 - TICKET EXPORT & IMPORT
  // =========================================================================
  describe('Feature 3.4 - Ticket Export & Import', () => {
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

    const createProject = async (accessToken: string, ownerId: number, name: string) => {
      const response = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name, description: 'Export Import tests', ownerId })
        .expect(200);
      return response.body.id as number;
    };

    // Sub-test: Verifying tickets are properly exported to CSV format
    it('successfully exports tickets for a project to a CSV string', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_export`);
      const accessToken = await login(user.username, user.password);
      const projectId = await createProject(accessToken, user.id, 'Export Project');

      // Create two tickets to populate the CSV
      await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Export ticket 1',
          description: 'Desc 1',
          status: 'TODO',
          priority: 'LOW',
          type: 'BUG',
          projectId,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Export ticket 2',
          description: 'Desc 2',
          status: 'DONE',
          priority: 'HIGH',
          type: 'FEATURE',
          projectId,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(200);

      // Fetch the CSV export
      const response = await request(app.getHttpServer())
        .get(`/tickets/export?projectId=${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify it's a CSV string and contains the correct headers and data
      const csvData = response.text;
      expect(typeof csvData).toBe('string');
      expect(csvData).toContain('id,title,description,status,priority,type,dueDate,projectId,assigneeId,isOverdue');
      expect(csvData).toContain('Export ticket 1');
      expect(csvData).toContain('Export ticket 2');
    });

    // Sub-test: Verifying CSV import handles commas and quotes correctly
    it('successfully imports tickets from CSV and handles internal commas in text', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_import`);
      const accessToken = await login(user.username, user.password);
      const projectId = await createProject(accessToken, user.id, 'Import Project');

      // Create a CSV string in memory. Notice the description is wrapped in quotes because it contains commas.
      const csvContent = 
`title,description,status,priority,type,dueDate,projectId,assigneeId
Simple Ticket,Easy bug to fix,TODO,LOW,BUG,2026-05-01T00:00:00Z,${projectId},
Complex Ticket,"A complex, annoying, and weird bug",IN_PROGRESS,HIGH,BUG,2026-05-01T00:00:00Z,${projectId},`;
      
      const buffer = Buffer.from(csvContent);

      const response = await request(app.getHttpServer())
        .post('/tickets/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('projectId', projectId)
        .attach('file', buffer, 'import.csv')
        .expect(200);

      expect(response.body.created).toBe(2);
      expect(response.body.failed).toBe(0);
      expect(response.body.errors).toEqual([]);

      // Verify the complex ticket was actually created with the correct description
      const verifyResponse = await request(app.getHttpServer())
        .get(`/tickets?projectId=${projectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
        
      const tickets = verifyResponse.body as Array<{title: string, description: string}>;
      const complexTicket = tickets.find(t => t.title === 'Complex Ticket');
      expect(complexTicket).toBeDefined();
      expect(complexTicket?.description).toBe('A complex, annoying, and weird bug');
    });

    // Sub-test: Verifying invalid rows are skipped and reported while valid rows are saved
    it('skips invalid rows and reports validation errors during import', async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_import_fail`);
      const accessToken = await login(user.username, user.password);
      const projectId = await createProject(accessToken, user.id, 'Partial Import Project');

      // Row 2 is missing a title and has an invalid status.
      const csvContent = 
`title,description,status,priority,type,dueDate,projectId,assigneeId
Valid Ticket,Will be saved,TODO,LOW,BUG,2026-05-01T00:00:00Z,${projectId},
,Missing title and bad status,INVALID_STATUS,LOW,BUG,2026-05-01T00:00:00Z,${projectId},`;
      
      const buffer = Buffer.from(csvContent);

      const response = await request(app.getHttpServer())
        .post('/tickets/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('projectId', projectId)
        .attach('file', buffer, 'partial.csv')
        .expect(200);

      expect(response.body.created).toBe(1);
      expect(response.body.failed).toBe(1);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0]).toContain('Row 2');
      expect(response.body.errors[0]).toContain('title is required');
    });
  });

    // =========================================================================
  // FEATURE 3.7 - AUTO-SCHEDULING ESCALATION LEVEL ON TICKETS
  // =========================================================================
  describe('Feature 3.7 - Auto-Scheduling Escalation Level on Tickets', () => {
    let accessToken: string;
    let projectId: number;

    const createUser = async (suffix: string) => {
      const username = `user_${suffix}`;
      const password = 'secret';

      const response = await request(app.getHttpServer())
        .post('/users')
        .send({
          username,
          email: `${username}@example.com`,
          fullName: `Test User ${suffix}`,
          role: 'DEVELOPER',
          password,
        })
        .expect(200);

      return { id: response.body.id as number, username, password };
    };

    const login = async (username: string, password: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(200);

      return response.body.accessToken as string;
    };

    const createProject = async (ownerId: number, name: string) => {
      const response = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name,
          description: 'Escalation tests',
          ownerId,
        })
        .expect(200);

      return response.body.id as number;
    };

    const createTicket = async (options: {
      title: string;
      dueDate: string;
      priority?: string;
      status?: string;
    }) => {
      const response = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: options.title,
          description: 'Escalation test ticket',
          status: options.status ?? 'TODO',
          priority: options.priority ?? 'LOW',
          type: 'BUG',
          projectId,
          dueDate: options.dueDate,
        })
        .expect(200);

      return response.body as { id: number };
    };

    const getTicket = async (ticketId: number) => {
      const response = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      return response.body as { id: number; priority: string; isOverdue: boolean; version: number };
    };

    beforeEach(async () => {
      const suffix = Date.now().toString();
      const user = await createUser(`${suffix}_escalation_owner`);
      accessToken = await login(user.username, user.password);
      projectId = await createProject(user.id, 'Escalation Project');
    });

    // Sub-test: Verifying LOW escalates to MEDIUM without marking overdue.
    it('promotes LOW to MEDIUM and keeps isOverdue false', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const ticket = await createTicket({
        title: 'Basic escalation ticket',
        dueDate: pastDate,
        priority: 'LOW',
      });

      const escalationService = app.get(TicketsEscalationService);
      await escalationService.escalateOverdueTickets();

      const updated = await getTicket(ticket.id);
      expect(updated.priority).toBe('MEDIUM');
      expect(updated.isOverdue).toBe(false);
    });

    // Sub-test: Verifying HIGH escalates to CRITICAL and sets isOverdue.
    it('promotes HIGH to CRITICAL and sets isOverdue true', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const ticket = await createTicket({
        title: 'Critical threshold ticket',
        dueDate: pastDate,
        priority: 'HIGH',
      });

      const escalationService = app.get(TicketsEscalationService);
      await escalationService.escalateOverdueTickets();

      const updated = await getTicket(ticket.id);
      expect(updated.priority).toBe('CRITICAL');
      expect(updated.isOverdue).toBe(true);
    });

    // Sub-test: Verifying idempotent behavior for CRITICAL overdue tickets.
    it('keeps CRITICAL overdue tickets unchanged on subsequent runs', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const ticket = await createTicket({
        title: 'Idempotent escalation ticket',
        dueDate: pastDate,
        priority: 'CRITICAL',
      });

      const escalationService = app.get(TicketsEscalationService);
      await escalationService.escalateOverdueTickets();
      await escalationService.escalateOverdueTickets();

      const updated = await getTicket(ticket.id);
      expect(updated.priority).toBe('CRITICAL');
      expect(updated.isOverdue).toBe(true);
    });

    // Sub-test: Verifying future-due and DONE tickets are ignored.
    it('ignores tickets that are not overdue or are DONE', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const pastDate = new Date(Date.now() - 86400000).toISOString();

      const futureTicket = await createTicket({
        title: 'Future ticket',
        dueDate: futureDate,
        priority: 'LOW',
      });

      const doneTicket = await createTicket({
        title: 'Done ticket',
        dueDate: pastDate,
        priority: 'LOW',
        status: 'DONE',
      });

      const escalationService = app.get(TicketsEscalationService);
      await escalationService.escalateOverdueTickets();

      const futureUpdated = await getTicket(futureTicket.id);
      const doneUpdated = await getTicket(doneTicket.id);

      expect(futureUpdated.priority).toBe('LOW');
      expect(doneUpdated.priority).toBe('LOW');
    });

    // Sub-test: Verifying manual priority update resets isOverdue.
    it('resets isOverdue when priority is manually updated', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const ticket = await createTicket({
        title: 'Manual override ticket',
        dueDate: pastDate,
        priority: 'HIGH',
      });

      const escalationService = app.get(TicketsEscalationService);
      await escalationService.escalateOverdueTickets();

      const escalated = await getTicket(ticket.id);
      expect(escalated.priority).toBe('CRITICAL');
      expect(escalated.isOverdue).toBe(true);

      await request(app.getHttpServer())
        .patch(`/tickets/${ticket.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          priority: 'MEDIUM',
          version: escalated.version,
        })
        .expect(200);

      const updated = await getTicket(ticket.id);
      expect(updated.priority).toBe('MEDIUM');
      expect(updated.isOverdue).toBe(false);
    });
  });
});
