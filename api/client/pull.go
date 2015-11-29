package client

import (
	"fmt"

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
	cmd.Require(flag.Exact, 0)
	cmd.ParseFlags(args, true)

	name := cmd.Arg(0)

	return pull("", name)
}

func pull(contextDir, name string) error {
	site, err := storage.NewLocalSite(contextDir)
	if err != nil {
		return err
	}

	if !site.IsExist(site.GetConfigKey()) {
		return fmt.Errorf("fatal: Not a get3w repository: '%s'", site.Path)
	}

	appname := name
	if appname == "" {
		appname = site.Name
	}

	client := get3w.NewClient("")

	fmt.Printf("Pulling '%s' into '%s'...\n", appname, site.Name)

	output, _, err := client.Apps.Pull(appname)
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
			downloadURL := "http://" + appname + ".get3w.net/" + path
			fmt.Printf("Receiving object: %s, done.\n", path)
			site.Download(path, downloadURL)
		}
	}
	fmt.Println("Checking connectivity... done.")

	return nil
}
