-- Link inputs (YouTube lectures): no file and no pasted text, just a URL the
-- Extract stage resolves into a transcript.
alter table app.job_inputs add column source_url text;
alter table app.job_inputs drop constraint job_inputs_has_payload;
alter table app.job_inputs add constraint job_inputs_has_payload
  check (storage_key is not null or text_content is not null or source_url is not null);
