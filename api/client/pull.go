package client

import (
	"fmt"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
)

// CmdPull pull an app repository from the remote address.
//
// Usage: get3w clone [OPTIONS] IMAGENAME[:TAG|@DIGEST]
func (cli *Get3WCli) CmdPull(args ...string) error {
	cmd := Cli.Subcmd("pull", []string{"NAME[:TAG|@DIGEST]"}, Cli.DockerCommands["pull"].Description, true)
	cmd.Require(flag.Min, 1)
	cmd.ParseFlags(args, true)

	origin := cmd.Arg(0)

	return pull("", origin)
}

func pull(contextDir, origin string) error {
	site, err := storage.NewLocalSite(contextDir)
	if err != nil {
		return err
	}

	arr := strings.Split(origin, "/")
	if len(arr) != 2 {
		return fmt.Errorf("fatal: pull source '%s' not valid", origin)
	}

	if !site.IsExist(site.GetConfigKey()) {
		return fmt.Errorf("fatal: Not a get3w repository: '%s'", site.Path)
	}

	client := get3w.NewClient("")

	fmt.Printf("Pulling '%s' into '%s'...\n", origin, site.Name)

	output, _, err := client.Apps.Pull(arr[0], arr[1])
	if err != nil {
		return err
	}

	fmt.Printf("Counting objects: %d, done.\n", len(output.Files))
	for path, remoteChecksum := range output.Files {
		pull := false
		if !site.IsExist(path) {
			pull = true
		} else {
			checksum, _ := site.Checksum(path)
			if checksum != remoteChecksum {
				pull = true
			}
		}

		if pull {
			downloadURL := "http://" + arr[0] + ".get3w.net/" + path
			fmt.Printf("Receiving object: %s, done.\n", path)
			site.Download(path, downloadURL)
		}
	}
	fmt.Println("Checking connectivity... done.")

	return nil
}
