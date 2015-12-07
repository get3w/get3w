package client

import (
	"encoding/base64"
	"fmt"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/repos"
	"github.com/get3w/get3w/storage"
)

// CmdGet get an app repository from the remote address.
//
// Usage: get3w get [OPTIONS] REMOTEURL DIR
func (cli *Get3WCli) CmdGet(args ...string) error {
	cmd := Cli.Subcmd("get", []string{"URL", "URL DIR"}, Cli.Get3WCommands["get"].Description, true)
	cmd.Require(flag.Min, 1)
	cmd.ParseFlags(args, true)

	url := cmd.Arg(0)
	dir := cmd.Arg(1)

	return cli.get(url, dir)
}

func (cli *Get3WCli) get(url, dir string) error {
	site, err := storage.NewLocalSite(dir)
	if err != nil {
		return err
	}

	// Resolve the Repository name to Repository
	repo, err := repos.ParseRepository(url)
	if err != nil {
		return err
	}

	// if !site.IsExist(site.GetConfigKey()) {
	// 	return fmt.Errorf("fatal: Not a get3w repository: '%s'", site.Path)
	// }

	client := get3w.NewClient(cli.configFile.AuthConfig.AccessToken)

	fmt.Printf("Getting repository '%s/%s/%s'...\n", repo.Host, repo.Owner, repo.Name)

	if repo.Host != get3w.DefaultRepositoryHost() {
		return fmt.Errorf("ERROR: Only %s supported\n", get3w.DefaultRepositoryHost())
	}

	fmt.Print("Counting objects: ")
	output, _, err := client.Apps.FilesChecksum(repo.Owner, repo.Name)
	if err != nil {
		return err
	}
	fmt.Printf("%d, done.\n", len(output.Files))

	for path, remoteChecksum := range output.Files {
		download := false
		if !site.IsExist(path) {
			download = true
		} else {
			checksum, _ := site.Checksum(path)
			if checksum != remoteChecksum {
				download = true
			}
		}

		if download {
			fmt.Printf("Receiving object: %s", path)
			fileOutput, _, err := client.Apps.GetFile(repo.Owner, repo.Name, path)
			if err != nil {
				return err
			}
			data, err := base64.StdEncoding.DecodeString(fileOutput.Content)
			if err != nil {
				return err
			}
			site.Write(path, data)
			fmt.Println(", done.")
		}
	}

	config, err := site.GetConfig()
	if err != nil {
		return err
	}

	config.Repository = repo
	err = site.WriteConfig(config)
	if err != nil {
		return err
	}

	return cli.build(dir)
}
