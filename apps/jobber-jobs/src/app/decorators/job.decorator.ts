import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common';
import { JobMetaData } from '../interfaces/job-metadata.interface';

export const JOB_METADATA_KEY = 'job_meta';

export const Job = (meta: JobMetaData) =>
  applyDecorators(SetMetadata(JOB_METADATA_KEY, meta), Injectable());
