import { Injectable, NotFoundException } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";

export type FeedbackResponse = {
  id: string;
  answerId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
};

@Injectable()
export class FeedbackService {
  constructor(private readonly orm: MikroORM) {}

  async create(input: CreateFeedbackDto): Promise<FeedbackResponse> {
    const connection = this.orm.em.fork().getConnection();
    const answerRows = await connection.execute<{ id: string }[]>("select id from answers where id = ?::uuid", [
      input.answerId
    ]);

    if (answerRows.length === 0) {
      throw new NotFoundException("Answer not found");
    }

    const [feedback] = await connection.execute<
      Array<{ id: string; answer_id: string; rating: number; comment?: string | null; created_at: Date | string }>
    >(
      `
        insert into feedback (answer_id, rating, comment)
        values (?::uuid, ?, ?)
        returning id, answer_id, rating, comment, created_at;
      `,
      [input.answerId, input.rating, input.comment ?? null]
    );

    return {
      id: feedback.id,
      answerId: feedback.answer_id,
      rating: feedback.rating,
      comment: feedback.comment,
      createdAt: toIsoString(feedback.created_at)
    };
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
