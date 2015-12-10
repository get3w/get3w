package cli

import flag "github.com/get3w/get3w/pkg/mflag"

// CommonFlags represents flags that are common to both the client and the daemon.
type CommonFlags struct {
	FlagSet   *flag.FlagSet
	PostParse func()

	Debug    bool
	LogLevel string
	TrustKey string
}

// Command is the struct contains command name and description
type Command struct {
	Name        string
	Description string
}

var get3wCommands = []Command{
	{"attach", "Attach to a running container"},
	{"build", "Build an app from a CONFIG.yml"},
	{"clone", "Clone an app to current directory"},
	{"cp", "Copy files/folders between a container and the local filesystem"},
	{"create", "Create a new container"},
	{"diff", "Inspect changes on a container's filesystem"},
	{"events", "Get real time events from the server"},
	{"exec", "Run a command in a running container"},
	{"export", "Export a container's filesystem as a tar archive"},
	{"get", "Get downloads and builds the app"},
	{"history", "Show the history of an image"},
	{"images", "List images"},
	{"import", "Import the contents from a tarball to create a filesystem image"},
	{"info", "Display system-wide information"},
	{"inspect", "Return low-level information on a container or image"},
	{"kill", "Kill a running container"},
	{"load", "Load an image from a tar archive or STDIN"},
	{"login", "Register or log in to a Get3W registry"},
	{"logout", "Log out from a Get3W registry"},
	{"logs", "Fetch the logs of a container"},
	{"network", "Manage Get3W networks"},
	{"pause", "Pause all processes within a container"},
	{"port", "List port mappings or a specific mapping for the CONTAINER"},
	{"ps", "List containers"},
	{"pull", "Pull an image or a repository from a registry"},
	{"push", "Updates remote app using local files"},
	{"rename", "Rename a container"},
	{"restart", "Restart a container"},
	{"rm", "Remove one or more containers"},
	{"rmi", "Remove one or more images"},
	{"run", "Run a command in a new container"},
	{"save", "Save an image(s) to a tar archive"},
	{"search", "Search the Get3W Hub for images"},
	{"start", "Start one or more stopped containers"},
	{"status", "Displays paths that have differences between the remote and local app"},
	{"stop", "Stop a running container"},
	{"tag", "Tag an image into a repository"},
	{"top", "Display the running processes of a container"},
	{"unpause", "Unpause all processes within a container"},
	{"version", "Show the Get3W version information"},
	{"volume", "Manage Get3W volumes"},
	{"watch", "Block until a container stops, then print its exit code"},
}

// Get3WCommands stores all the Get3W command
var Get3WCommands = make(map[string]Command)

func init() {
	for _, cmd := range get3wCommands {
		Get3WCommands[cmd.Name] = cmd
	}
}
