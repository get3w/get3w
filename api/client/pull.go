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
func (cli *DockerCli) CmdPull(args ...string) error {
	cmd := Cli.Subcmd("pull", []string{"NAME[:TAG|@DIGEST]"}, Cli.DockerCommands["pull"].Description, true)
	cmd.Require(flag.Exact, 0)

	cmd.ParseFlags(args, true)

	site, err := storage.NewLocalSite("")
	if err != nil {
		return err
	}

	if !site.IsExist(site.GetConfigKey()) {
		return fmt.Errorf("fatal: Not a get3w repository: '%s'", site.Path)
	}

	client := get3w.NewClient(nil)

	fmt.Printf("Pulling into '%s'...\n", site.Name)

	lastModified := ""
	if appConfig := cli.configFile.AppConfigs[site.Path]; appConfig != nil {
		lastModified = appConfig.LastModified
	}

	input := &get3w.AppPullInput{
		LastModified: lastModified,
	}
	files, _, err := client.Apps.Pull(site.Name, input)
	if err != nil {
		return err
	}

	fmt.Printf("Counting objects: %d, done.\n", len(files))
	for _, file := range files {
		pull := false
		if !site.IsExist(file.Path) {
			pull = true
		} else {
			checksum, _ := site.Checksum(file.Path)
			if checksum != file.Checksum {
				pull = true
			}
		}

		if pull {
			downloadURL := "http://" + site.Name + ".get3w.net/" + file.Path
			fmt.Printf("Receiving object: %s, done.\n", file.Path)
			site.Download(file.Path, downloadURL)
		}
	}
	fmt.Println("Checking connectivity... done.")

	return nil
}
