class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.7.3"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.3/remotelink-v0.7.3-darwin-arm64", using: :nounzip
      sha256 "f82df3a28e5af1c4f95f4315ebf16a1b642b0cf9299d8ee082ef5b19b0acf0a0"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.3/remotelink-v0.7.3-darwin-amd64", using: :nounzip
      sha256 "37f99e3b47656b28d80be432f80433a02850c476fcd3d51b0355f16ee93ff13a"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.3/remotelink-v0.7.3-linux-arm64", using: :nounzip
      sha256 "984afc9cec9acb4ed05dc814877d67b6ba48d283bed5eb04709eda40a167a992"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.3/remotelink-v0.7.3-linux-amd64", using: :nounzip
      sha256 "285c75cf350928e7017dde881790e96a0b50cd2dcc4dbe7265d976403852aa90"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.7.3", shell_output("#{bin}/remotelink --version").strip
  end
end
