package client

import (
	"fmt"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/storage/local"
)

// CmdClone clone an app repository from the remote address.
//
// Usage: get3w clone [OPTIONS] IMAGENAME[:TAG|@DIGEST]
func (cli *DockerCli) CmdClone(args ...string) error {
	cmd := Cli.Subcmd("clone", []string{"NAME[:TAG|@DIGEST]"}, Cli.DockerCommands["clone"].Description, true)
	cmd.Require(flag.Exact, 1)

	cmd.ParseFlags(args, true)
	appname := cmd.Arg(0)

	if local.IsDirExist(appname) {
		return fmt.Errorf("fatal: destination path '%s' already exists and is not an empty directory", appname)
	}

	client := get3w.NewClient(nil)

	fmt.Printf("Cloning into '%s'...\n", appname)
	timestamp, files, _, err := client.Apps.Clone(appname)
	if err != nil {
		return err
	}

	site, err := storage.NewLocalSite(appname)
	if err != nil {
		return err
	}

	fmt.Printf("Counting objects: %d, done.\n", len(files))
	for _, file := range files {
		downloadURL := "http://" + appname + ".get3w.net/" + file.Path
		fmt.Printf("Receiving object: %s, done.\n", file.Path)
		site.Download(file.Path, downloadURL)
	}

	dirPath, _ := local.GetDirPath(appname)
	cli.configFile.Timestamps[dirPath] = timestamp
	if err := cli.configFile.Save(); err != nil {
		return fmt.Errorf("Error saving config file: %v", err)
	}
	fmt.Println("Checking connectivity... done.")

	return nil
}
