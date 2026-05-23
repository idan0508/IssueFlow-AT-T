import { getSchemaPath } from '@nestjs/swagger';
import { Ticket } from '../entities/ticket.entity';

export const ticketWithOverdueSchema = {
  allOf: [
    { $ref: getSchemaPath(Ticket) },
    {
      properties: {
        isOverdue: { type: 'boolean', example: false },
      },
    },
  ],
};

export const ticketWithOverdueArraySchema = {
  type: 'array',
  items: ticketWithOverdueSchema,
};
