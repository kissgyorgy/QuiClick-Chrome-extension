export PYTHONPATH=@server@

action="${1:-help}"
shift || true

case "$action" in
server)
	exec uvicorn quiclick_server.main:app \
		--host "${QUICLICK_HOST:-0.0.0.0}" \
		--port "${QUICLICK_PORT:-8000}" "$@"
	;;
*)
	echo "Usage: quiclick {server}"
	exit 1
	;;
esac
