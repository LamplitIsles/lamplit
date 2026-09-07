## Connections between experiences

Graph memory is your Partner’s durable, connected recollection of people, events, preferences, and relationships. It is distinct from a chat transcript and from the temporary context supplied to a model request.

Lamplit Full provides this through Hindsight. Core does not include Hindsight; keeping Core’s state and workspace is different from having graph memory.

The memory graph is one way to look at those connections.

## How to use memory

Long-term memory provides a foundation for continuity across conversations. What is retained and recalled depends on the model service and integration settings. Retrieval can be incomplete or inaccurate, so keep independent copies of anything important.

Think of the graph as a set of connections to shared experiences. It helps your Partner draw on earlier conversations as you continue spending time together.

## Where the data lives

Hindsight’s durable memory is stored in Full’s PostgreSQL volume, `lamplit-hindsight-postgres`. The Hindsight container filesystem and model cache are not durable data stores.

Back up the Partner workspace, DSH state, Keet identity, and database separately. Keeping only one volume will not restore the whole deployment.

## Back up memory

In the Full Compose directory, with the original environment variables available, pause Hindsight writes and create a PostgreSQL custom-format dump:

```bash
docker compose stop hindsight
docker compose exec -T hindsight-postgres \
  pg_dump -U hindsight -d hindsight -Fc > hindsight-$(date +%Y%m%d).dump
docker compose start hindsight
```

Check that the command succeeded and the dump is valid, then keep it in a private backup location. If export fails, inspect the error and bring the service back up. A partial file is not a valid backup.

## Verify before restoring

The tested memory export/import unit is a PostgreSQL custom-format dump. Restore into a new, disposable volume running a compatible database first. Verify the `pgroonga` and `vector` extensions, and confirm the target image reports PGroonga 4.0.8 and pgvector 0.8.6.

Before switching, check that real memory reads and writes succeed. Keep the old volume until verification is complete. The repository’s [container operations guide](https://github.com/LamplitIsles/lamplit/blob/main/docs/container-operations.md) provides the maintenance background.
