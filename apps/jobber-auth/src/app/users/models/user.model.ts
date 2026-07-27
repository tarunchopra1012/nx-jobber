import { AbstractModel } from '@jobber/nestjs';
import { Field, ObjectType } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

@ObjectType()
export class User extends AbstractModel {
  @Field(() => String)
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
