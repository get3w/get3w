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
	authConfig := &cli.configFile.AuthConfig
	var repo *get3w.Repository
	var err error

	if url != "" {
		repo, err = repos.ParseRepository(url)
		if err != nil {
			return err
		}
		if dir == "" {
			dir = repo.Name
		}
	}

	site, err := storage.NewLocalSite(dir)
	if err != nil {
		return err
	}

	if repo == nil {
		repo = site.Config.Repository
		if repo == nil || repo.Host == "" || repo.Owner == "" || repo.Name == "" {
			repo = &get3w.Repository{
				Host:  get3w.DefaultRepositoryHost(),
				Owner: authConfig.Username,
				Name:  site.Name,
			}
		}
	}

	client := get3w.NewClient(cli.configFile.AuthConfig.AccessToken)

	if repo.Host != get3w.DefaultRepositoryHost() {
		return fmt.Errorf("ERROR: Only %s supported\n", get3w.DefaultRepositoryHost())
	}

	fmt.Printf("Getting repository '%s/%s/%s'...\n", repo.Host, repo.Owner, repo.Name)

	fmt.Print("Counting objects: ")
	output, _, err := client.Apps.FilesChecksum(repo.Owner, repo.Name)
	if err != nil {
		return err
	}
	fmt.Printf("%d, done.\n", len(output.Files))

	for path, remoteChecksum := range output.Files {
		download := false
		if !site.IsExist(site.GetSourceKey(path)) {
			download = true
		} else {
			checksum, _ := site.Checksum(site.GetSourceKey(path))
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
			site.Write(site.GetSourceKey(path), data)
			fmt.Println(", done.")
		}
	}

	// site.Config.Repository = repo
	// err = site.WriteConfig()
	// if err != nil {
	// 	return err
	// }

	return cli.build(dir)
}
