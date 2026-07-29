import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Job {
  @Field(() => String)
  name: string;

  @Field(() => String)
  description: string;
}
