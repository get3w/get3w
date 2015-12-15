package client

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/cliconfig"
	"github.com/get3w/get3w/pkg/ioutils"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/pkg/stringutils"
	"github.com/get3w/get3w/repos"
	"github.com/get3w/get3w/storage"
)

// CmdPush pushs an app or a repository to the registry.
//
// Usage: get3w push [OPTIONS] URL DIR
func (cli *Get3WCli) CmdPush(args ...string) error {
	cmd := Cli.Subcmd("push", []string{"", "URL", "URL DIR"}, Cli.Get3WCommands["push"].Description, true)
	cmd.Require(flag.Max, 2)
	cmd.ParseFlags(args, true)

	url := cmd.Arg(0)
	dir := cmd.Arg(1)

	return cli.push(url, dir)
}

func (cli *Get3WCli) push(url, dir string) error {
	site, err := storage.NewLocalSite(dir)
	if err != nil {
		return err
	}

	authConfig := &cli.configFile.AuthConfig

	var repo *get3w.Repository
	if url != "" {
		repo, err = repos.ParseRepository(url)
		if err != nil {
			return err
		}
	} else {
		repo = site.Config.Repository
		if repo == nil || repo.Host == "" || repo.Owner == "" || repo.Name == "" {
			//fmt.Fprintln(cli.out, "WARNING: repository is unset.")
			repo = &get3w.Repository{
				Host:  get3w.DefaultRepositoryHost(),
				Owner: authConfig.Username,
				Name:  site.Name,
			}
		}
	}

	if repo == nil || repo.Host == "" || repo.Owner == "" || repo.Name == "" {
		return fmt.Errorf("ERROR: remote repository invalid. use: get3w push URL")
	}

	if authConfig.Username == "" || authConfig.AccessToken == "" || authConfig.Username != repo.Owner {
		fmt.Fprintf(cli.out, "\nPlease login prior to %s:\n", "push")
		authConfig, err = cli.login("", "")
		if err != nil {
			return err
		}
	}

	if authConfig.Username != repo.Owner {
		return fmt.Errorf("ERROR: Authentication failed for '%s'\n", url)
	}

	client := get3w.NewClient(authConfig.AccessToken)
	output, _, err := client.Apps.FilesChecksum(repo.Owner, repo.Name)
	if err != nil {
		return err
	}
	files := output.Files

	localFiles, err := site.Storage.GetAllFiles(site.Storage.GetSourcePrefix(""))
	if err != nil {
		return err
	}

	// 1 specified add, 0 specified edit, -1 specified delete
	pathMap := make(map[string]int)

	for _, localFile := range localFiles {
		if strings.HasPrefix(localFile.Path, site.Config.Destination) {
			continue
		}
		if localFile.IsDir {
			continue
		}
		checksum := files[localFile.Path]
		if checksum == "" {
			pathMap[localFile.Path] = 1
		} else {
			localChecksum, _ := site.Storage.Checksum(localFile.Path)
			if checksum != localChecksum {
				pathMap[localFile.Path] = 0
			}
		}
	}
	for path := range files {
		if !site.Storage.IsExist(path) {
			pathMap[path] = -1
		}
	}

	fmt.Fprintf(cli.out, "Remote repository: %s/%s/%s\n", repo.Host, repo.Owner, repo.Name)

	if len(pathMap) == 0 {
		fmt.Fprintln(cli.out, "Everything up-to-date")
		return nil
	}

	configPath := cliconfig.ConfigDir()
	gzPath := filepath.Join(configPath, stringutils.UUID()+".tar.gz")

	err = ioutils.Pack(gzPath, site.Path, pathMap)
	if err != nil {
		return err
	}

	data, err := ioutil.ReadFile(gzPath)
	if err != nil {
		return err
	}
	os.Remove(gzPath)

	blob := base64.StdEncoding.EncodeToString(data)

	input := &get3w.FilesPushInput{
		Blob: blob,
	}

	for path, val := range pathMap {
		if val > 0 {
			fmt.Fprintf(cli.out, "\t+added:%s\n", path)
			input.Added = append(input.Added, path)
		}
	}
	for path, val := range pathMap {
		if val < 0 {
			fmt.Fprintf(cli.out, "\t-removed:%s\n", path)
			input.Removed = append(input.Removed, path)
		}
	}
	for path, val := range pathMap {
		if val == 0 {
			fmt.Fprintf(cli.out, "\tmodified:%s\n", path)
			input.Modified = append(input.Modified, path)
		}
	}

	_, _, err = client.Apps.FilesPush(repo.Owner, repo.Name, input)
	if err != nil {
		return err
	}

	fmt.Fprintln(cli.out, "done.")
	return nil
}
