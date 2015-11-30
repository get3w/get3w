package client

import (
	"fmt"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/cliconfig"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/storage/local"
)

// CmdClone clone an app repository from the remote address.
//
// Usage: get3w clone [OPTIONS] IMAGENAME[:TAG|@DIGEST]
func (cli *Get3WCli) CmdClone(args ...string) error {
	cmd := Cli.Subcmd("clone", []string{"NAME[:TAG|@DIGEST]"}, Cli.DockerCommands["clone"].Description, true)
	cmd.Require(flag.Min, 1)

	cmd.ParseFlags(args, true)
	origin := cmd.Arg(0)
	name := cmd.Arg(1)

	arr := strings.Split(origin, "/")
	if len(arr) != 2 {
		return fmt.Errorf("fatal: clone source '%s' not valid", origin)
	}
	if name == "" {
		name = arr[1]
	}
	if local.IsDirExist(name) {
		return fmt.Errorf("fatal: destination path '%s' already exists and is not an empty directory", name)
	}

	client := get3w.NewClient("")

	fmt.Printf("Cloning into '%s'...\n", name)
	output, _, err := client.Apps.Clone(arr[0], arr[1])
	if err != nil {
		return err
	}

	site, err := storage.NewLocalSite(name)
	if err != nil {
		return err
	}

	fmt.Printf("Counting objects: %d, done.\n", len(output.Files))
	for _, file := range output.Files {
		downloadURL := "http://" + name + ".get3w.net/" + file.Path
		fmt.Printf("Receiving object: %s, done.\n", file.Path)
		site.Download(file.Path, downloadURL)
	}

	dirPath, _ := local.GetDirPath(name)
	appConfig := &cliconfig.AppConfig{
		LastModified: output.LastModified,
	}
	cli.configFile.AppConfigs[dirPath] = appConfig

	if err := cli.configFile.Save(); err != nil {
		return fmt.Errorf("Error saving config file: %v", err)
	}
	fmt.Println("Checking connectivity... done.")

	return nil
}
