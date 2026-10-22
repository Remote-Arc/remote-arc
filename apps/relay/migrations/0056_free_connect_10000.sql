-- Free includes 10,000 monthly Connect calls for every account. Publish new
-- versions so prior commercial terms and payment history remain immutable.
INSERT INTO arc_commercial_versions
  (id,product_id,kind,mode,config_json,base_revision,created_at,published_at)
SELECT 'free-connect-10000:'||v.id,v.product_id,v.kind,v.mode,
  json_set(v.config_json,'$.connectToolCalls',10000),h.revision,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM arc_commercial_heads h JOIN arc_commercial_versions v ON v.id=h.version_id
WHERE h.product_id='free';

INSERT INTO arc_commercial_audit
  (id,actor_id,action,subject_id,mode,details_json,created_at)
SELECT 'migration:0056:'||h.mode,NULL,'published','free-connect-10000:'||h.version_id,h.mode,
  json_object('previousVersion',h.version_id,'revision',h.revision+1,
    'reason','Restore 10000 monthly Connect calls for all Free accounts'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM arc_commercial_heads h WHERE h.product_id='free';

UPDATE arc_commercial_heads SET version_id='free-connect-10000:'||version_id,
  revision=revision+1 WHERE product_id='free';
