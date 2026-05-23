import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../entities/ticket.entity';

export interface EnrichedParsedRow {
  rowNumber: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  dueDate: Date;
  projectId: number;
  assigneeId?: number;
}

export interface ExportableTicket {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  dueDate: Date;
  project?: { id: number } | null;
  assignee?: { id: number } | null;
  isOverdue: boolean;
}

/**
 * Converts enriched ticket data into a CSV string for download/response bodies.
 */
export function buildTicketsCsv(tickets: ExportableTicket[]): string {
  const records = tickets.map((ticket) => ({
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    dueDate: ticket.dueDate.toISOString(),
    projectId: ticket.project?.id ?? '',
    assigneeId: ticket.assignee?.id ?? '',
    isOverdue: ticket.isOverdue,
  }));

  // header: true emits a first row with column names for easier imports.
  return stringify(records, { header: true });
}

/**
 * Parses a CSV file buffer into validated rows and error messages.
 */
export function parseTicketsCsv(
  buffer: Buffer,
  projectId: number,
): {
  validRows: EnrichedParsedRow[];
  validationErrors: string[];
} {
  let records: Record<string, string>[];

  try {
    records = parse(buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      // columns: true maps header names to object keys for row-wise validation.
    }) as Record<string, string>[];
  } catch (error) {
    throw new BadRequestException(
      'Failed to parse CSV file. Please ensure the file is a valid comma-separated text file.',
    );
  }

  const validRows: EnrichedParsedRow[] = [];
  const validationErrors: string[] = [];

  records.forEach((row, index) => {
    const rowNumber = index + 1;
    const title = (row.title || '').trim();
    const description = (row.description || '').trim();
    const statusRaw = (row.status || '').trim().toUpperCase();
    const priorityRaw = (row.priority || '').trim().toUpperCase();
    const typeRaw = (row.type || '').trim().toUpperCase();
    const dueDateRaw = (row.dueDate || '').trim();
    const assigneeIdRaw = (row.assigneeId || '').trim();

    const rowErrors: string[] = [];

    if (!title) {
      rowErrors.push('title is required');
    }

    if (!description) {
      rowErrors.push('description is required');
    }

    if (!statusRaw) {
      rowErrors.push('status is required');
    }

    if (!priorityRaw) {
      rowErrors.push('priority is required');
    }

    if (!typeRaw) {
      rowErrors.push('type is required');
    }

    const status = statusRaw as TicketStatus;
    if (statusRaw && !Object.values(TicketStatus).includes(status)) {
      rowErrors.push(`status '${statusRaw}' is invalid`);
    }

    const priority = priorityRaw as TicketPriority;
    if (priorityRaw && !Object.values(TicketPriority).includes(priority)) {
      rowErrors.push(`priority '${priorityRaw}' is invalid`);
    }

    const type = typeRaw as TicketType;
    if (typeRaw && !Object.values(TicketType).includes(type)) {
      rowErrors.push(`type '${typeRaw}' is invalid`);
    }

    let dueDate: Date | null = null;
    if (!dueDateRaw) {
      rowErrors.push('dueDate is required');
    } else {
      const parsedDate = new Date(dueDateRaw);
      if (Number.isNaN(parsedDate.getTime())) {
        rowErrors.push(`dueDate '${dueDateRaw}' is invalid`);
      } else {
        dueDate = parsedDate;
      }
    }

    if (!Number.isInteger(projectId)) {
      rowErrors.push('projectId is required');
    }

    let assigneeId: number | undefined;
    if (assigneeIdRaw) {
      assigneeId = Number(assigneeIdRaw);
      if (!Number.isInteger(assigneeId)) {
        rowErrors.push(`assigneeId '${assigneeIdRaw}' is invalid`);
      }
    }

    if (rowErrors.length > 0) {
      // Collect invalid rows so a single bad record does not stop the import.
      validationErrors.push(`Row ${rowNumber}: ${rowErrors.join(', ')}`);
      return;
    }

    validRows.push({
      rowNumber,
      title,
      description,
      status,
      priority,
      type,
      dueDate: dueDate as Date,
      projectId,
      assigneeId,
    });
  });

  return { validRows, validationErrors };
}
