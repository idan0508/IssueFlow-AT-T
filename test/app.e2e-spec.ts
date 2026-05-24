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

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('IssueFlow is running!');
  });
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
});
